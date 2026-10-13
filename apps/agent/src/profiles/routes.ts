import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { ProfileInputSchema, type ApiError } from "@memory-lane/shared";
import { hashOwnerToken, mintOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { ProfileLimitError, type ProfileStore } from "./store";

const IdParams = z.object({ id: z.uuid() });

const notFound = (reply: FastifyReply) =>
  reply
    .code(404)
    .send({ error: "not_found", message: "We couldn't find that profile." } satisfies ApiError);

/**
 * Profile routes (docs/04 §5). Non-owners get 404, not 403, so ids can't be probed. 4xx bodies name the
 * fields that failed, never the submitted values.
 */
export async function profileRoutes(app: FastifyInstance, opts: { store: ProfileStore | null }) {
  const { store } = opts;
  const create = { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } };
  const remove = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  // Bodies depend on the bearer token, so no shared caches may keep them.
  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    const vary = reply.getHeader("Vary");
    reply.header("Vary", vary ? `${String(vary)}, Authorization` : "Authorization");
    return payload;
  });

  if (!store) {
    const unavailable = async (_req: unknown, reply: FastifyReply) =>
      reply.code(503).send({
        error: "unavailable",
        message: "Profiles need the database, which isn't set up yet.",
      } satisfies ApiError);
    app.post("/api/profiles", create, unavailable);
    app.get("/api/profiles", unavailable);
    app.get("/api/demo-profiles", unavailable);
    app.get("/api/profiles/:id", unavailable);
    app.delete("/api/profiles/:id", remove, unavailable);
    return;
  }

  app.post("/api/profiles", create, async (req, reply) => {
    const parsed = ProfileInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "invalid_profile",
        message: "Some answers need another look.",
        fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      } satisfies ApiError);
    }
    // Only tokens the server minted and that still own a profile are reused; anything else gets a
    // fresh token, so clients can't pick weak or shared tokens.
    const presented = readOwnerToken(req);
    const reuse = !!presented && (await store.ownerHasProfiles(hashOwnerToken(presented)));
    const token = reuse && presented ? presented : mintOwnerToken();
    try {
      const profile = await store.create(parsed.data, hashOwnerToken(token));
      return reply.code(201).send(reuse ? { profile } : { profile, ownerToken: token });
    } catch (err) {
      if (!(err instanceof ProfileLimitError)) throw err;
      return reply.code(409).send({
        error: "profile_limit",
        message:
          err.scope === "owner"
            ? "This device has reached the limit for profiles. Delete one to add another."
            : "Memory Lane has reached today's limit for new profiles. Please try again tomorrow.",
      } satisfies ApiError);
    }
  });

  // The fictional demo personas: public and read-only (the judge path, docs/06 §1.6).
  app.get("/api/demo-profiles", async () => ({ profiles: await store.listDemos() }));

  app.get("/api/profiles", async (req) => {
    const token = readOwnerToken(req);
    return { profiles: token ? await store.listByOwner(hashOwnerToken(token)) : [] };
  });

  app.get("/api/profiles/:id", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return notFound(reply);
    const token = readOwnerToken(req);
    const stored = await store.get(params.data.id, token ? hashOwnerToken(token) : null);
    if (!stored) return notFound(reply);
    // The "why" behind an avoid item is for the owner only, also on public demo profiles.
    const profile = stored.isOwner
      ? stored.view
      : { ...stored.view, avoid: stored.view.avoid.map((a) => ({ ...a, reason: null })) };
    return { profile, isOwner: stored.isOwner };
  });

  app.delete("/api/profiles/:id", remove, async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    const token = readOwnerToken(req);
    if (!params.success || !token) return notFound(reply);
    const deleted = await store.delete(params.data.id, hashOwnerToken(token));
    return deleted ? reply.code(204).send() : notFound(reply);
  });
}
