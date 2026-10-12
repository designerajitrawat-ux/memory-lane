import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ConfirmRequestSchema, type ApiError, type ResolveEvent } from "@memory-lane/shared";
import { hashOwnerToken, readOwnerToken } from "../auth/ownerToken";
import { createRateLimiter } from "../qloo/budget";
import type { QlooGateway } from "../qloo/gateway";
import type { ProfileStore } from "../profiles/store";
import { resolveSeeds } from "./resolve";
import { ConfirmError, type ResolutionStore } from "./store";

const IdParams = z.object({ id: z.uuid() });
const DAY_MS = 24 * 60 * 60 * 1000;
const PING_MS = 15_000; // keeps proxies (Cloudflare: 100 s idle) from cutting a slow run

export interface ResolveRouteDeps {
  profiles: ProfileStore;
  resolutions: ResolutionStore;
  gateway: Pick<QlooGateway, "call">;
  limits?: {
    lookupsPerOwnerPerDay?: number;
    lookupsPerClientPerDay?: number;
    budgetReserve?: number;
  };
}

const notFound = (reply: FastifyReply) =>
  reply
    .code(404)
    .send({ error: "not_found", message: "We couldn't find that profile." } satisfies ApiError);

/**
 * Stage 1 routes (docs/04 §5). Owner only: anyone else gets 404. Resolve streams Server-Sent Events
 * over a POST (EventSource can't POST or send the bearer header).
 */
export async function resolveRoutes(
  app: FastifyInstance,
  opts: { deps: ResolveRouteDeps | null; clientIp?: (req: FastifyRequest) => string },
) {
  const { deps } = opts;

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("Cache-Control", "no-store");
    const vary = reply.getHeader("Vary");
    reply.header("Vary", vary ? `${String(vary)}, Authorization` : "Authorization");
    return payload;
  });

  if (!deps) {
    const unavailable = async (_req: unknown, reply: FastifyReply) =>
      reply.code(503).send({
        error: "unavailable",
        message: "This needs the database, which isn't set up yet.",
      } satisfies ApiError);
    app.post("/api/profiles/:id/seeds/resolve", unavailable);
    app.get("/api/profiles/:id/seeds", unavailable);
    app.post("/api/profiles/:id/seeds/confirm", unavailable);
    return;
  }

  // Shared-quota protection (security review W1): one run per profile at a time, and a daily number of
  // lookups per device token and per client IP. In memory: the agent runs as a single instance.
  const running = new Set<string>();
  const perOwner = createRateLimiter({
    max: deps.limits?.lookupsPerOwnerPerDay ?? 50,
    windowMs: DAY_MS,
  });
  const perClient = createRateLimiter({
    max: deps.limits?.lookupsPerClientPerDay ?? 100,
    windowMs: DAY_MS,
  });
  const clientIp = opts.clientIp ?? ((req: FastifyRequest) => req.ip);

  async function ownedProfile(req: FastifyRequest) {
    const params = IdParams.safeParse(req.params);
    const token = readOwnerToken(req);
    if (!params.success || !token || !deps) return null;
    const ownerHash = hashOwnerToken(token);
    const stored = await deps.profiles.get(params.data.id, ownerHash);
    return stored?.isOwner ? { profile: stored.view, ownerHash } : null;
  }

  app.get("/api/profiles/:id/seeds", async (req, reply) => {
    const owned = await ownedProfile(req);
    if (!owned) return notFound(reply);
    return { resolutions: await deps.resolutions.resolutions(owned.profile.id) };
  });

  app.post(
    "/api/profiles/:id/seeds/resolve",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req);
      if (!owned) return notFound(reply);
      const { profile, ownerHash } = owned;
      if (running.has(profile.id)) {
        return reply.code(409).send({
          error: "already_checking",
          message: "These favourites are already being checked.",
        } satisfies ApiError);
      }
      running.add(profile.id);
      const client = clientIp(req);

      // Take over the socket for streaming; keep the CORS/helmet headers set by earlier hooks.
      reply.hijack();
      reply.raw.writeHead(200, {
        ...(reply.getHeaders() as Record<string, string>),
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        vary: "Origin, Authorization",
        "x-accel-buffering": "no",
      });
      let aborted = false;
      reply.raw.on("close", () => {
        if (!reply.raw.writableFinished) aborted = true;
      });
      const send = (event: ResolveEvent) => {
        if (!aborted) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      const ping = setInterval(() => {
        if (!aborted) reply.raw.write(": ping\n\n");
      }, PING_MS);
      ping.unref();

      try {
        await resolveSeeds(
          { profileId: profile.id, nickname: profile.nickname },
          {
            gateway: deps.gateway,
            store: deps.resolutions,
            allowLookup: () => perOwner.tryTake(ownerHash) && perClient.tryTake(client),
            budgetReserve: deps.limits?.budgetReserve ?? 0,
          },
          send,
          () => aborted,
        );
      } catch (err) {
        req.log.error({ err }, "seed resolution failed");
        send({
          type: "error",
          problem: "unavailable",
          message: "Something went wrong while checking. Please try again.",
        });
        // The stream always ends with `done`, so the page shows what was saved before the failure.
        try {
          send({
            type: "done",
            message: "Done.",
            data: await deps.resolutions.resolutions(profile.id),
          });
        } catch {
          // The browser reloads the list itself when no `done` arrives.
        }
      } finally {
        clearInterval(ping);
        running.delete(profile.id);
        reply.raw.end();
      }
    },
  );

  app.post(
    "/api/profiles/:id/seeds/confirm",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req);
      if (!owned) return notFound(reply);
      const body = ConfirmRequestSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({
          error: "invalid_choice",
          message: "Those choices couldn't be read.",
        } satisfies ApiError);
      }
      try {
        await deps.resolutions.confirm(owned.profile.id, body.data.decisions);
      } catch (err) {
        if (!(err instanceof ConfirmError)) throw err;
        return reply.code(409).send({
          error: "choice_out_of_date",
          message: "Those choices no longer match what Qloo found. Please check again.",
        } satisfies ApiError);
      }
      return { resolutions: await deps.resolutions.resolutions(owned.profile.id) };
    },
  );
}
