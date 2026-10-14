import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReactionRequestSchema, type ApiError } from "@memory-lane/shared";
import { hashOwnerToken, mintOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { createResearchAllowance } from "../limits";
import {
  needsDatabase,
  notFound,
  ownedProfile,
  privateResponse,
  readableProfile,
} from "../profiles/owned";
import { ProfileLimitError, type ProfileStore } from "../profiles/store";
import type { QlooGateway } from "../qloo/gateway";
import { createRunLock } from "../sse";
import { BUSY, type ResearchRouteOpts } from "../stage1/routes";
import type { TasteStore } from "../stage2/store";
import { planNextSession } from "./plan";
import type { SessionStore } from "./store";

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
    app.post("/api/demo-profiles/:id/try", needsDatabase);
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
      if (!lock.tryAcquire(profileId)) return reply.code(409).send(BUSY);
      let result;
      try {
        const client = clientIp(req);
        result = await planNextSession(
          { profileId, nickname: owned.profile.nickname },
          {
            taste: deps.taste,
            sessions: deps.sessions,
            ...(deps.gateway ? { gateway: deps.gateway } : {}),
            allowCall: () => allowance.take(owned.ownerHash, client),
            budgetReserve: allowance.budgetReserve,
          },
        );
      } finally {
        lock.release(profileId);
      }
      if (result.kind === "no_taste_profile") {
        return reply.code(409).send({
          error: "no_taste_profile",
          message: "Build the Life Taste Profile first.",
        } satisfies ApiError);
      }
      if (result.kind === "nothing_to_plan") {
        return reply.code(409).send({
          error: "nothing_to_plan",
          message: "There's nothing in the profile that can go into a session yet.",
        } satisfies ApiError);
      }
      return reply.code(result.reused ? 200 : 201).send({ session: result.session });
    },
  );

  // "Try it yourself": a private copy of a demo persona on this device, with session 1 planned, so a
  // visitor can log reactions and watch Stage 4 plan session 2 with Qloo. Same token rules and limits
  // as creating a profile; the demo itself never changes.
  app.post(
    "/api/demo-profiles/:id/try",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const params = IdParams.safeParse(req.params);
      if (!params.success) return notFound(reply);
      const presented = readOwnerToken(req);
      const reuse =
        !!presented && (await deps.profiles.ownerHasProfiles(hashOwnerToken(presented)));
      const token = reuse && presented ? presented : mintOwnerToken();
      const ownerHash = hashOwnerToken(token);
      let copied: { profileId: string } | null;
      try {
        copied = await deps.profiles.copyDemo(params.data.id, ownerHash);
      } catch (err) {
        if (!(err instanceof ProfileLimitError)) throw err;
        return reply.code(409).send({
          error: "profile_limit",
          message:
            err.scope === "owner"
              ? "This device has reached the limit for profiles. Delete one to make a copy."
              : "Memory Lane has reached today's limit for new profiles. Please try again tomorrow.",
        } satisfies ApiError);
      }
      if (!copied) return notFound(reply);
      const view = await deps.profiles.get(copied.profileId, ownerHash);
      const result = await planNextSession(
        { profileId: copied.profileId, nickname: view?.view.nickname ?? null },
        { taste: deps.taste, sessions: deps.sessions },
      );
      if (result.kind !== "planned") {
        return reply.code(409).send({
          error: "nothing_to_plan",
          message: "There's nothing in the profile that can go into a session yet.",
        } satisfies ApiError);
      }
      return reply
        .code(201)
        .send(reuse ? { session: result.session } : { session: result.session, ownerToken: token });
    },
  );

  app.get("/api/profiles/:id/sessions", async (req, reply) => {
    const readable = await readableProfile(req, deps.profiles);
    if (!readable) return notFound(reply);
    return { sessions: await deps.sessions.list(readable.profile.id) };
  });

  app.get("/api/sessions/:id", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return sessionNotFound(reply);
    const found = await deps.sessions.get(params.data.id, ownerHashOf(req));
    return found ? { session: found.session, readOnly: found.readOnly } : sessionNotFound(reply);
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
        // A note with personal details gets its own gentle message; anything else is just unreadable.
        const noteIssue = body.error.issues.find((i) => i.path[0] === "note");
        return reply.code(400).send({
          error: noteIssue ? "invalid_note" : "invalid_reaction",
          message: noteIssue?.message ?? "That reaction couldn't be read.",
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
