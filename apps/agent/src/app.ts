import Fastify, { type FastifyServerOptions } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { DbCheck, HealthResponse, QlooCheck } from "@memory-lane/shared";
import type { QlooGateway } from "./qloo/gateway";
import type { Db } from "./db/client";

export interface AppDeps {
  gateway: QlooGateway;
  db: Db | null;
  version: string;
  webOrigins: string[];
  trustProxyHops?: number;
  logger?: FastifyServerOptions["logger"];
}

export const LOGGER_OPTIONS: FastifyServerOptions["logger"] = {
  level: "info",
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
    censor: "[redacted]",
  },
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
        return reply
          .code(500)
          .send({
            statusCode: 500,
            error: "Internal Server Error",
            message: "Something went wrong.",
          });
      }
      return reply.code(status).send({ statusCode: status, error: err.name, message: err.message });
    },
  );

  await app.register(helmet);
  await app.register(cors, {
    origin: deps.webOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["content-type"],
    maxAge: 600,
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  const startedAt = Date.now();
  let cached: { at: number; checks: Promise<[QlooCheck, DbCheck]> } | null = null;

  const readiness = () => {
    if (!cached || Date.now() - cached.at > HEALTH_CACHE_MS) {
      cached = { at: Date.now(), checks: Promise.all([checkQloo(deps.gateway), checkDb(deps.db)]) };
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

async function checkQloo(gateway: QlooGateway): Promise<QlooCheck> {
  try {
    return await gateway.capabilities();
  } catch {
    return { ok: false, state: "unavailable", message: "Couldn't start or reach the Qloo tools." };
  }
}

async function checkDb(db: Db | null): Promise<DbCheck> {
  if (!db) return { ok: false, state: "not_configured", message: "No database is configured yet." };
  try {
    return await db.ping();
  } catch {
    return { ok: false, state: "error", message: "Couldn't reach the database." };
  }
}
