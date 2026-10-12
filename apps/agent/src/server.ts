import { resolve } from "node:path";
import pkg from "../package.json";
import { buildApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { createMemoryBudgetStore, createPgBudgetStore } from "./qloo/budget";
import { createMemoryCacheStore, createPgCacheStore } from "./qloo/cache";
import { createMemoryEvidenceStore, createPgEvidenceStore } from "./qloo/evidence";
import { createQlooGateway } from "./qloo/gateway";
import { createQlooMcpClient } from "./qloo/mcpClient";

async function main() {
  const env = loadEnv();
  const db = createDb(env.DATABASE_URL, { verifyTls: env.NODE_ENV === "production" });
  let dbSetupFailed = false;
  if (db) {
    try {
      await db.migrate(resolve(env.MIGRATIONS_DIR));
    } catch (err) {
      // Keep serving: health shows the DB state, and the error code (not the message) is logged.
      const e = err as { code?: string; cause?: { code?: string }; message?: string };
      const code =
        e.code ??
        e.cause?.code ??
        (e.message?.includes("_journal") ? "MIGRATIONS_NOT_FOUND" : "unknown");
      process.stderr.write(`database migration failed (code ${code})\n`);
      dbSetupFailed = true;
    }
  }

  const mcp = createQlooMcpClient(env.QLOO_MCP_COMMAND);
  // Without a database (local dev) the gateway keeps cache, evidence and budget in memory.
  const gateway = createQlooGateway({
    mcp,
    cache: db ? createPgCacheStore(db.drizzle) : createMemoryCacheStore(),
    evidence: db ? createPgEvidenceStore(db.drizzle) : createMemoryEvidenceStore(),
    budget: db ? createPgBudgetStore(db.drizzle) : createMemoryBudgetStore(),
    dailyBudget: env.DAILY_QLOO_CALL_BUDGET,
    cacheTtlMs: env.QLOO_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
    // Only called once requests are served, i.e. after `app` below exists.
    log: { warn: (obj, msg) => app.log.warn(obj, msg) },
  });
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);

  const app = await buildApp({
    gateway,
    db,
    version: commit ? `${pkg.version}+${commit}` : pkg.version,
    webOrigins: env.WEB_ORIGIN,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    logProxyHeaders: env.LOG_PROXY_HEADERS,
    dbSetupFailed,
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await Promise.allSettled([mcp.close(), db?.close()]);
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: "0.0.0.0", port: env.PORT });

  // Warm up `qloo mcp` (cold start is ~10 s) so the first health check is quick.
  void gateway.capabilities().then((q) => app.log.info({ qloo: q.state }, "qloo readiness"));
}

main().catch((err: unknown) => {
  // Startup errors only (bad env, port in use). Env values are never part of these messages.
  process.stderr.write(
    `agent failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
