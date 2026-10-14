import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { ApiError, EvidenceView, TasteEvent } from "@memory-lane/shared";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { profiles, qlooCalls, seeds } from "../db/schema";
import type { AppDb } from "../db/types";
import type { DigestItem } from "../qloo/evidence";
import { createResearchAllowance } from "../limits";
import type { QlooGateway } from "../qloo/gateway";
import {
  needsDatabase,
  notFound,
  ownedProfile,
  privateResponse,
  readableProfile,
} from "../profiles/owned";
import type { ProfileStore } from "../profiles/store";
import { BUSY, type ResearchRouteOpts } from "../stage1/routes";
import { createRunLock, startSse } from "../sse";
import { buildTasteProfile } from "./build";
import type { TasteStore } from "./store";

export interface TasteRouteDeps {
  profiles: ProfileStore;
  store: TasteStore;
  gateway: Pick<QlooGateway, "call">;
  /** For GET /api/evidence/:id (owner-checked through the profile). */
  db: AppDb;
}

const EvidenceParams = z.object({ id: z.uuid() });

/**
 * Stage 2 routes (docs/04 §5): build (SSE) and read the Life Taste Profile, and read one evidence
 * record behind an item. Owner only; anyone else gets 404.
 */
export async function tasteRoutes(
  app: FastifyInstance,
  opts: ResearchRouteOpts & { deps: TasteRouteDeps | null },
) {
  const { deps } = opts;
  app.addHook("onSend", privateResponse);

  if (!deps) {
    app.get("/api/profiles/:id/taste-profile", needsDatabase);
    app.post("/api/profiles/:id/taste-profile", needsDatabase);
    app.get("/api/evidence/:id", needsDatabase);
    return;
  }

  const lock = opts.lock ?? createRunLock();
  const allowance = opts.allowance ?? createResearchAllowance();
  const clientIp = opts.clientIp ?? ((req: FastifyRequest) => req.ip);

  // Owners and anyone looking at a public demo persona may read it.
  app.get("/api/profiles/:id/taste-profile", async (req, reply) => {
    const readable = await readableProfile(req, deps.profiles);
    if (!readable) return notFound(reply);
    return { tasteProfile: await deps.store.latest(readable.profile.id) };
  });

  app.post(
    "/api/profiles/:id/taste-profile",
    { config: { rateLimit: { max: 4, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req, deps.profiles);
      if (!owned) return notFound(reply);
      const { profile, ownerHash } = owned;
      if (!profile.seeds.some((s) => s.status === "confirmed")) {
        return reply.code(409).send({
          error: "nothing_confirmed",
          message: "Confirm at least one favourite with Qloo first.",
        } satisfies ApiError);
      }
      if (!lock.tryAcquire(profile.id)) return reply.code(409).send(BUSY);
      const client = clientIp(req);
      let sse: ReturnType<typeof startSse>;
      try {
        sse = startSse(reply);
      } catch (err) {
        lock.release(profile.id); // never leave the profile locked (security review S2)
        throw err;
      }
      const send = (event: TasteEvent) => sse.send(event);
      try {
        await buildTasteProfile(
          { profileId: profile.id, nickname: profile.nickname },
          {
            gateway: deps.gateway,
            store: deps.store,
            allowCall: () => allowance.take(ownerHash, client),
            budgetReserve: allowance.budgetReserve,
          },
          send,
          sse.isAborted,
        );
      } catch (err) {
        req.log.error({ err }, "taste profile build failed");
        send({
          type: "error",
          problem: "unavailable",
          message: "Something went wrong while building the profile. Please try again.",
        });
        send({ type: "done", message: "Nothing was built.", data: null });
      } finally {
        lock.release(profile.id);
        sse.end();
      }
    },
  );

  /** Names, from this profile's own records, for the Qloo ids a call sent (favourites, items). */
  const namesFor = async (profileId: string, ids: string[]): Promise<Record<string, string>> => {
    if (ids.length === 0) return {};
    const names: Record<string, string> = {};
    const latest = await deps.store.latest(profileId);
    for (const item of latest?.items ?? []) {
      if (ids.includes(item.entityId)) names[item.entityId] = item.name;
    }
    const seedRows = await deps.db
      .select({ id: seeds.qlooEntityId, name: seeds.displayName, raw: seeds.rawText })
      .from(seeds)
      .where(and(eq(seeds.profileId, profileId), inArray(seeds.qlooEntityId, ids)));
    for (const s of seedRows) if (s.id) names[s.id] = s.name ?? s.raw;
    return names;
  };

  // One Qloo call record, for the evidence drawer. Only the owner of the profile it was made for may
  // read it, or anyone for a public demo persona. The harness summary is not returned (it can carry
  // setup hints; security review S10).
  app.get("/api/evidence/:id", async (req, reply) => {
    const params = EvidenceParams.safeParse(req.params);
    const token = readOwnerToken(req);
    if (!params.success) return notFound(reply);
    const allowed = token
      ? or(eq(profiles.ownerTokenHash, hashOwnerToken(token)), eq(profiles.isDemo, true))
      : eq(profiles.isDemo, true);
    const [row] = await deps.db
      .select({
        id: qlooCalls.id,
        profileId: qlooCalls.profileId,
        tool: qlooCalls.tool,
        args: qlooCalls.argsChecked,
        status: qlooCalls.status,
        resultCount: qlooCalls.resultCount,
        cached: qlooCalls.cached,
        createdAt: qlooCalls.createdAt,
        digest: qlooCalls.resultsDigest,
      })
      .from(qlooCalls)
      .innerJoin(profiles, eq(profiles.id, qlooCalls.profileId))
      .where(and(eq(qlooCalls.id, params.data.id), allowed))
      .limit(1);
    if (!row) return notFound(reply);
    const { profileId, digest, ...call } = row;
    return {
      ...call,
      createdAt: row.createdAt.toISOString(),
      names: profileId ? await namesFor(profileId, idsSent(row.args)) : {},
      // Enough for the drawer (this item's place and a few others), not the whole answer.
      results: (digest as DigestItem[]).flatMap((d) => (d.name ? [d.name] : [])).slice(0, 10),
    } satisfies EvidenceView;
  });
}

/** The entity ids a call sent as signals or ranked options. */
function idsSent(args: unknown): string[] {
  const a = (args ?? {}) as { signals?: unknown; options?: unknown };
  return [a.signals, a.options]
    .flatMap((v) => (Array.isArray(v) ? v : []))
    .filter((v): v is string => typeof v === "string")
    .slice(0, 20);
}
