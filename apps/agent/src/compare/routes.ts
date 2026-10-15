import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { createResearchAllowance } from "../limits";
import { needsDatabase, notFound, privateResponse, readableProfile } from "../profiles/owned";
import type { ResearchRouteOpts } from "../stage1/routes";
import { buildCompare, type CompareDeps } from "./compare";

/**
 * GET /api/profiles/:id/compare (docs/04 §5, screen 9): owner, or anyone for a demo. The generic plan
 * is made once per profile facts and cached; a new one counts toward the daily LLM budget and this
 * device's and network's LLM allowance.
 */
export async function compareRoutes(
  app: FastifyInstance,
  opts: Pick<ResearchRouteOpts, "clientIp" | "allowance"> & { deps: CompareDeps | null },
) {
  const { deps } = opts;
  const allowance = opts.allowance ?? createResearchAllowance();
  const clientIp = opts.clientIp ?? ((req: FastifyRequest) => req.ip);
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
      const ownerHash = readable.isOwner && token ? hashOwnerToken(token) : null;
      const client = clientIp(req);
      const compare = await buildCompare(readable.profile, ownerHash, deps, () =>
        allowance.takeLlm(ownerHash, client),
      );
      return compare ?? notFound(reply);
    },
  );
}
