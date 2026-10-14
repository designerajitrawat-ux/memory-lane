import type { FastifyInstance } from "fastify";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { needsDatabase, notFound, privateResponse, readableProfile } from "../profiles/owned";
import { buildCompare, type CompareDeps } from "./compare";

/**
 * GET /api/profiles/:id/compare (docs/04 §5, screen 9): owner, or anyone for a demo. The generic plan
 * is made once per profile facts and cached; a new one counts toward the daily LLM budget.
 */
export async function compareRoutes(app: FastifyInstance, opts: { deps: CompareDeps | null }) {
  const { deps } = opts;
  app.addHook("onSend", privateResponse);
  if (!deps) {
    app.get("/api/profiles/:id/compare", needsDatabase);
    return;
  }
  app.get(
    "/api/profiles/:id/compare",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const readable = await readableProfile(req, deps.profiles);
      if (!readable) return notFound(reply);
      const token = readOwnerToken(req);
      const compare = await buildCompare(
        readable.profile.id,
        readable.profile.nickname,
        readable.isOwner && token ? hashOwnerToken(token) : null,
        deps,
      );
      return compare ?? notFound(reply);
    },
  );
}
