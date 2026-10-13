import type { FastifyInstance, FastifyRequest } from "fastify";
import { ConfirmRequestSchema, type ApiError, type ResolveEvent } from "@memory-lane/shared";
import { createResearchAllowance, type ResearchAllowance, type ResearchLimits } from "../limits";
import type { QlooGateway } from "../qloo/gateway";
import { needsDatabase, notFound, ownedProfile, privateResponse } from "../profiles/owned";
import type { ProfileStore } from "../profiles/store";
import { createRunLock, startSse } from "../sse";
import { resolveSeeds } from "./resolve";
import { ConfirmError, type ResolutionStore } from "./store";

export interface ResolveRouteDeps {
  profiles: ProfileStore;
  resolutions: ResolutionStore;
  gateway: Pick<QlooGateway, "call">;
  /** Used when no shared allowance is passed (tests). */
  limits?: ResearchLimits;
}

export interface ResearchRouteOpts {
  clientIp?: (req: FastifyRequest) => string;
  /** Shared with Stage 2 so switching screens can't double anyone's share of the quota. */
  allowance?: ResearchAllowance;
  /** One research run per profile at a time, across stages. */
  lock?: ReturnType<typeof createRunLock>;
}

export const BUSY: ApiError = {
  error: "already_checking",
  message: "Memory Lane is already researching this profile.",
};

/**
 * Stage 1 routes (docs/04 §5). Owner only: anyone else gets 404. Resolve streams Server-Sent Events
 * over a POST (EventSource can't POST or send the bearer header).
 */
export async function resolveRoutes(
  app: FastifyInstance,
  opts: ResearchRouteOpts & { deps: ResolveRouteDeps | null },
) {
  const { deps } = opts;
  app.addHook("onSend", privateResponse);

  if (!deps) {
    app.post("/api/profiles/:id/seeds/resolve", needsDatabase);
    app.get("/api/profiles/:id/seeds", needsDatabase);
    app.post("/api/profiles/:id/seeds/confirm", needsDatabase);
    return;
  }

  const lock = opts.lock ?? createRunLock();
  const allowance = opts.allowance ?? createResearchAllowance(deps.limits);
  const clientIp = opts.clientIp ?? ((req: FastifyRequest) => req.ip);

  app.get("/api/profiles/:id/seeds", async (req, reply) => {
    const owned = await ownedProfile(req, deps.profiles);
    if (!owned) return notFound(reply);
    return { resolutions: await deps.resolutions.resolutions(owned.profile.id) };
  });

  app.post(
    "/api/profiles/:id/seeds/resolve",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req, deps.profiles);
      if (!owned) return notFound(reply);
      const { profile, ownerHash } = owned;
      if (!lock.tryAcquire(profile.id)) return reply.code(409).send(BUSY);
      const client = clientIp(req);
      const sse = startSse(reply);
      const send = (event: ResolveEvent) => sse.send(event);
      try {
        await resolveSeeds(
          { profileId: profile.id, nickname: profile.nickname },
          {
            gateway: deps.gateway,
            store: deps.resolutions,
            allowLookup: () => allowance.take(ownerHash, client),
            budgetReserve: allowance.budgetReserve,
          },
          send,
          sse.isAborted,
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
        lock.release(profile.id);
        sse.end();
      }
    },
  );

  app.post(
    "/api/profiles/:id/seeds/confirm",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const owned = await ownedProfile(req, deps.profiles);
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
