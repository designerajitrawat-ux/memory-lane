import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReactionRequestSchema, type ApiError } from "@memory-lane/shared";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { createResearchAllowance } from "../limits";
import { needsDatabase, notFound, ownedProfile, privateResponse } from "../profiles/owned";
import type { ProfileStore } from "../profiles/store";
import type { QlooGateway } from "../qloo/gateway";
import { createRunLock } from "../sse";
import { BUSY, type ResearchRouteOpts } from "../stage1/routes";
import { avoidMatcher } from "../stage2/avoid";
import type { TasteStore } from "../stage2/store";
import { adapt, type Adaptation } from "../stage4/adapt";
import { composeSession } from "./compose";
import type { SessionStore } from "./store";
import { validateSessionItems } from "./validate";

export interface SessionRouteDeps {
  profiles: ProfileStore;
  taste: TasteStore;
  sessions: SessionStore;
  /** Stage 4 asks Qloo for more like what landed; without it, sessions adapt by weights only. */
  gateway?: Pick<QlooGateway, "call">;
}

const IdParams = z.object({ id: z.uuid() });

const sessionNotFound = (reply: FastifyReply) =>
  reply
    .code(404)
    .send({ error: "not_found", message: "We couldn't find that session." } satisfies ApiError);

/** The caller's owner hash, or null without a token. */
function ownerHashOf(req: FastifyRequest): string | null {
  const token = readOwnerToken(req);
  return token ? hashOwnerToken(token) : null;
}

/**
 * Stage 3 + 4 routes (docs/04 §5): plan a session from the newest Life Taste Profile (learning from the
 * last session's reactions first), read it, log reactions, finish it. Owner only; anyone else gets
 * 404. Learning may ask Qloo (≤2 calls), so it shares the research allowance and run lock.
 */
export async function sessionRoutes(
  app: FastifyInstance,
  opts: ResearchRouteOpts & { deps: SessionRouteDeps | null },
) {
  const { deps } = opts;
  app.addHook("onSend", privateResponse);

  if (!deps) {
    app.post("/api/profiles/:id/sessions", needsDatabase);
    app.get("/api/profiles/:id/sessions", needsDatabase);
    app.get("/api/sessions/:id", needsDatabase);
    app.post("/api/session-items/:id/reaction", needsDatabase);
    app.post("/api/sessions/:id/complete", needsDatabase);
    return;
  }

  const lock = opts.lock ?? createRunLock();
  const allowance = opts.allowance ?? createResearchAllowance();
  const clientIp = opts.clientIp ?? ((req: FastifyRequest) => req.ip);

  app.post(
    "/api/profiles/:id/sessions",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req, deps.profiles);
      if (!owned) return notFound(reply);
      const profileId = owned.profile.id;
      const [taste, ctx, recent, existing] = await Promise.all([
        deps.taste.latest(profileId),
        deps.taste.context(profileId),
        deps.sessions.lastSessionEntities(profileId),
        deps.sessions.list(profileId),
      ]);
      if (!taste || taste.items.length === 0) {
        return reply.code(409).send({
          error: "no_taste_profile",
          message: "Build the Life Taste Profile first.",
        } satisfies ApiError);
      }
      const sessionNumber = (existing[0]?.number ?? 0) + 1;
      if (!lock.tryAcquire(profileId)) return reply.code(409).send(BUSY);
      let profile = taste;
      let learned: Adaptation | null = null;
      try {
        // Stage 4: learn from the last session before planning this one.
        if (existing.length > 0 && ctx) {
          const client = clientIp(req);
          learned = await adapt(
            {
              profileId,
              nickname: owned.profile.nickname,
              profile: taste,
              ctx,
              reactions: await deps.sessions.reactions(profileId),
              lastSessionNumber: existing[0]?.number ?? 0,
            },
            {
              gateway: deps.gateway ?? { call: async () => ({ kind: "unavailable", message: "" }) },
              store: deps.taste,
              allowCall: () => !!deps.gateway && allowance.take(owned.ownerHash, client),
              budgetReserve: allowance.budgetReserve,
            },
          );
          await deps.sessions.addLearnedAvoid(profileId, learned.learnedAvoid);
          if (learned.learnedItems.length) {
            profile = await deps.taste.save(profileId, {
              era: taste.era,
              partial: taste.partial,
              items: [...taste.items, ...learned.learnedItems],
              notes: [
                ...taste.notes,
                `Learned from session ${sessionNumber - 1}: ${learned.learnedItems.map((i) => i.name).join(", ")}.`,
              ],
            });
          }
        }
      } finally {
        lock.release(profileId);
      }
      const composed = composeSession({
        profile,
        sessionNumber,
        recent,
        ...(learned ? { weights: learned.weights, favouriteDomain: learned.favouriteDomain } : {}),
      });
      const { kept } = validateSessionItems(
        composed,
        profile.items,
        avoidMatcher([...(ctx?.avoid ?? []), ...(learned?.learnedAvoid.map((a) => a.text) ?? [])]),
        sessionNumber,
      );
      if (kept.length === 0) {
        return reply.code(409).send({
          error: "nothing_to_plan",
          message: "There's nothing in the profile that can go into a session yet.",
        } satisfies ApiError);
      }
      const session = await deps.sessions.create(
        profileId,
        profile.id,
        kept,
        learned?.whatChanged ?? [],
      );
      return reply.code(201).send({ session });
    },
  );

  app.get("/api/profiles/:id/sessions", async (req, reply) => {
    const owned = await ownedProfile(req, deps.profiles);
    if (!owned) return notFound(reply);
    return { sessions: await deps.sessions.list(owned.profile.id) };
  });

  app.get("/api/sessions/:id", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const ownerHash = ownerHashOf(req);
    if (!params.success || !ownerHash) return sessionNotFound(reply);
    const session = await deps.sessions.get(params.data.id, ownerHash);
    return session ? { session } : sessionNotFound(reply);
  });

  app.post(
    "/api/session-items/:id/reaction",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const params = IdParams.safeParse(req.params);
      const ownerHash = ownerHashOf(req);
      if (!params.success || !ownerHash) return sessionNotFound(reply);
      const body = ReactionRequestSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "invalid_reaction",
          message: "That reaction couldn't be read.",
        } satisfies ApiError);
      }
      const item = await deps.sessions.react(
        params.data.id,
        ownerHash,
        body.data.value,
        body.data.note?.length ? body.data.note : null,
      );
      return item ? { item } : sessionNotFound(reply);
    },
  );

  app.post(
    "/api/sessions/:id/complete",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const params = IdParams.safeParse(req.params);
      const ownerHash = ownerHashOf(req);
      if (!params.success || !ownerHash) return sessionNotFound(reply);
      const session = await deps.sessions.complete(params.data.id, ownerHash);
      return session ? { session } : sessionNotFound(reply);
    },
  );
}
