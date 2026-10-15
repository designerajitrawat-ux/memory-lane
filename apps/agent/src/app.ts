import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { DbCheck, HealthResponse, QlooCheck } from "@memory-lane/shared";
import type { QlooGateway } from "./qloo/gateway";
import type { Db } from "./db/client";
import { clientIpResolver } from "./clientIp";
import { profileRoutes } from "./profiles/routes";
import { resolveRoutes, type ResolveRouteDeps } from "./stage1/routes";
import { tasteRoutes, type TasteRouteDeps } from "./stage2/routes";
import { sessionRoutes, type SessionRouteDeps } from "./stage3/routes";
import { compareRoutes } from "./compare/routes";
import type { CompareDeps } from "./compare/compare";
import type { ProfileStore } from "./profiles/store";
import { createResearchAllowance, type ResearchLimits } from "./limits";
import { createRunLock } from "./sse";

export interface AppDeps {
  gateway: Pick<QlooGateway, "capabilities">;
  db: Db | null;
  /** Profile storage; null without a database (routes then answer 503). */
  profiles?: ProfileStore | null;
  /** Stage 1 seed resolution; null without a database (routes then answer 503). */
  resolution?: ResolveRouteDeps | null;
  /** Stage 2 Life Taste Profile; null without a database (routes then answer 503). */
  taste?: TasteRouteDeps | null;
  /** Stage 3 sessions and reactions; null without a database (routes then answer 503). */
  sessions?: SessionRouteDeps | null;
  /** "With vs without Qloo"; null without a database (the route then answers 503). */
  compare?: CompareDeps | null;
  /** Shared quota protection for every user-triggered research route. */
  research?: ResearchLimits;
  version: string;
  webOrigins: string[];
  trustProxyHops?: number;
  /** Header the edge sets to the real client IP (Render/Cloudflare: cf-connecting-ip); see clientIp.ts. */
  clientIpHeader?: string;
  /** True when startup migrations failed: the DB may answer pings but lack our tables. */
  dbSetupFailed?: boolean;
  logger?: FastifyServerOptions["logger"];
}

/**
 * Error serializer for logs. Query errors (drizzle/postgres) carry the SQL and its parameters, which
 * can include user data, so only their type and code are kept.
 */
export function safeErr(err: unknown): {
  type: string;
  message: string;
  stack: string;
  code?: unknown;
} {
  if (!err || typeof err !== "object") return { type: typeof err, message: "", stack: "" };
  const e = err as {
    name?: string;
    message?: string;
    stack?: string;
    code?: unknown;
    cause?: { code?: unknown };
  };
  const isQueryError =
    "query" in e || "params" in e || e.name === "DrizzleQueryError" || e.name === "PostgresError";
  if (isQueryError) {
    return { type: e.name ?? "Error", message: "", stack: "", code: e.code ?? e.cause?.code };
  }
  return { type: e.name ?? "Error", message: e.message ?? "", stack: e.stack ?? "", code: e.code };
}

export const LOGGER_OPTIONS: FastifyServerOptions["logger"] = {
  level: "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
    censor: "[redacted]",
  },
  serializers: { err: safeErr },
};

// Readiness checks spawn work (Qloo harness call + DB query), so share one result for a short
// while and let concurrent requests wait on the same in-flight check.
const HEALTH_CACHE_MS = 10_000;

export async function buildApp(deps: AppDeps) {
  const hops = deps.trustProxyHops ?? 0;
  const app = Fastify({
    logger: deps.logger ?? LOGGER_OPTIONS,
    bodyLimit: 64 * 1024,
    // Trust only the first `hops` proxies, so a client can't spoof its IP to dodge rate limits.
    trustProxy: hops > 0 ? (_addr: string, hop: number) => hop < hops : false,
  });

  // Never echo raw error text (it can carry hosts, paths or credentials) in 5xx responses.
  app.setErrorHandler(
    (err: { statusCode?: number; name?: string; message?: string }, req, reply) => {
      const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
      if (status >= 500) {
        req.log.error({ err }, "unhandled error");
        return reply.code(500).send({
          statusCode: 500,
          error: "Internal Server Error",
          message: "Something went wrong.",
        });
      }
      // Fastify's own 4xx messages can quote the request (e.g. malformed JSON), so send fixed text.
      const message =
        status === 429
          ? "Too many requests. Please wait a little and try again."
          : status === 413
            ? "That request is too large."
            : "That request couldn't be read.";
      return reply
        .code(status)
        .send({ error: status === 429 ? "rate_limited" : "bad_request", message });
    },
  );
  await app.register(helmet);
  await app.register(cors, {
    origin: deps.webOrigins,
    methods: ["GET", "POST", "DELETE"],
    allowedHeaders: ["content-type", "authorization"],
    maxAge: 600,
  });
  const clientIp = clientIpResolver(deps.clientIpHeader, () =>
    app.log.warn("client IP header missing; rate limits fall back to the socket address"),
  );
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", keyGenerator: clientIp });
  // Unknown routes count against the rate limit too (probing).
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (_req, reply) =>
    reply.code(404).send({ error: "not_found", message: "Not found." }),
  );

  await app.register(profileRoutes, { store: deps.profiles ?? null });
  // One allowance and one run lock across research stages (security review W1).
  const research = {
    clientIp,
    allowance: createResearchAllowance(deps.research ?? deps.resolution?.limits),
    lock: createRunLock(),
  };
  await app.register(resolveRoutes, { deps: deps.resolution ?? null, ...research });
  await app.register(tasteRoutes, { deps: deps.taste ?? null, ...research });
  await app.register(sessionRoutes, { deps: deps.sessions ?? null, ...research });
  await app.register(compareRoutes, { deps: deps.compare ?? null, ...research });

  const startedAt = Date.now();
  let cached: { at: number; checks: Promise<[QlooCheck, DbCheck]> } | null = null;

  const readiness = () => {
    if (!cached || Date.now() - cached.at > HEALTH_CACHE_MS) {
      cached = {
        at: Date.now(),
        checks: Promise.all([checkQloo(deps.gateway), checkDb(deps.db, deps.dbSetupFailed)]),
      };
    }
    return cached.checks;
  };

  // Liveness only: the host's health check and the keep-alive ping. Touches neither Qloo nor the
  // DB, so deploys succeed while they aren't ready and the DB can still scale to zero.
  app.get("/api/health/live", { config: { rateLimit: false } }, async () => ({ ok: true }));

  // Readiness: what the web status strip (and an hourly uptime check) read.
  app.get("/api/health", async (_req, reply) => {
    const [qloo, db] = await readiness();
    const body: HealthResponse = {
      status: qloo.ok && db.ok ? "ok" : "degraded",
      version: deps.version,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
      checks: {
        agent: { ok: true, state: "ok", message: "Agent is running." },
        qloo,
        db,
      },
    };
    return reply.code(body.status === "ok" ? 200 : 503).send(body);
  });

  return app;
}

async function checkQloo(gateway: Pick<QlooGateway, "capabilities">): Promise<QlooCheck> {
  try {
    return await gateway.capabilities();
  } catch {
    return { ok: false, state: "unavailable", message: "Couldn't start or reach the Qloo tools." };
  }
}

async function checkDb(db: Db | null, setupFailed = false): Promise<DbCheck> {
  if (!db) return { ok: false, state: "not_configured", message: "No database is configured yet." };
  if (setupFailed) return { ok: false, state: "error", message: "Database setup didn't finish." };
  try {
    return await db.ping();
  } catch {
    return { ok: false, state: "error", message: "Couldn't reach the database." };
  }
}
