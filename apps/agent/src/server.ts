import { resolve } from "node:path";
import pkg from "../package.json";
import { buildApp } from "./app";
import { createDb } from "./db/client";
import { createDevPgliteDb } from "./db/devPglite";
import { isPgliteUrl, loadEnv } from "./env";
import { createMemoryBudgetStore, createPgBudgetStore } from "./qloo/budget";
import { createMemoryCacheStore, createPgCacheStore } from "./qloo/cache";
import { createMemoryEvidenceStore, createPgEvidenceStore } from "./qloo/evidence";
import { createQlooGateway } from "./qloo/gateway";
import { createQlooMcpClient } from "./qloo/mcpClient";
import { createFixtureMcpClient } from "./qloo/fixtureMcp";
import { createResolutionStore } from "./stage1/store";
import { createTasteStore } from "./stage2/store";
import { createSessionStore } from "./stage3/store";
import { createProfileStore } from "./profiles/store";
import { purgeStaleData } from "./db/maintenance";
import { ensureDemoProfiles } from "./demo/seed";
import { createLlmClient, createMemoryLlmStore, createPgLlmStore } from "./llm/client";

async function main() {
  const env = loadEnv();
  const db = isPgliteUrl(env.DATABASE_URL)
    ? await createDevPgliteDb() // local dev only (refused in production)
    : createDb(env.DATABASE_URL, { verifyTls: env.NODE_ENV === "production" });
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

  const mcp = env.QLOO_FIXTURE_DIR
    ? createFixtureMcpClient(resolve(env.QLOO_FIXTURE_DIR)) // dev only (refused in production)
    : createQlooMcpClient(env.QLOO_MCP_COMMAND);
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
  // The LLM steps, server-side only; without LLM_API_KEY they are honestly switched off.
  const llm = createLlmClient({
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL,
    model: env.LLM_MODEL,
    reasoningEffort: env.LLM_REASONING_EFFORT,
    dailyCalls: env.LLM_DAILY_CALLS,
    store: db && !dbSetupFailed ? createPgLlmStore(db.drizzle) : createMemoryLlmStore(),
    log: { warn: (obj, msg) => app.log.warn(obj, msg) },
  });
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);
  // Without a migrated schema the data routes answer an honest 503 instead of failing per query.
  const dataDb = db && !dbSetupFailed ? db : null;
  const profiles = dataDb
    ? createProfileStore(dataDb.drizzle, {
        perOwner: env.PROFILES_PER_OWNER,
        perDay: env.PROFILES_PER_DAY,
      })
    : null;

  const app = await buildApp({
    gateway,
    db,
    profiles,
    resolution:
      dataDb && profiles
        ? { profiles, resolutions: createResolutionStore(dataDb.drizzle), gateway }
        : null,
    taste:
      dataDb && profiles
        ? { profiles, store: createTasteStore(dataDb.drizzle), gateway, db: dataDb.drizzle, llm }
        : null,
    sessions:
      dataDb && profiles
        ? {
            profiles,
            taste: createTasteStore(dataDb.drizzle),
            sessions: createSessionStore(dataDb.drizzle),
            gateway,
            llm,
          }
        : null,
    compare:
      dataDb && profiles
        ? {
            profiles,
            taste: createTasteStore(dataDb.drizzle),
            sessions: createSessionStore(dataDb.drizzle),
            llm,
            db: dataDb.drizzle,
          }
        : null,
    research: {
      lookupsPerOwnerPerDay: env.STAGE1_LOOKUPS_PER_OWNER_DAY,
      lookupsPerClientPerDay: env.STAGE1_LOOKUPS_PER_CLIENT_DAY,
      budgetReserve: env.QLOO_BUDGET_RESERVE,
    },
    version: commit ? `${pkg.version}+${commit}` : pkg.version,
    webOrigins: env.WEB_ORIGIN,
    trustProxyHops: env.TRUST_PROXY_HOPS,
    clientIpHeader: env.CLIENT_IP_HEADER,
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

  // Retention: purge idle profiles and expired cache rows shortly after start, then daily.
  if (db && !dbSetupFailed) {
    const purge = () =>
      purgeStaleData(db.drizzle, { profileRetentionDays: env.PROFILE_RETENTION_DAYS })
        .then((n) => app.log.info({ purged: n }, "retention purge"))
        .catch((err: unknown) =>
          app.log.warn(
            { code: (err as { code?: string }).code ?? "unknown" },
            "retention purge failed",
          ),
        );
    setTimeout(() => void purge(), 60_000).unref();
    setInterval(() => void purge(), 24 * 60 * 60 * 1000).unref();
  }

  // Warm up `qloo mcp` (cold start is ~10 s) so the first health check is quick; then make sure the
  // demo personas exist (Qloo calls once; cached without expiry, skipped when present).
  const seedDemos = env.SEED_DEMOS ? env.SEED_DEMOS === "1" : env.NODE_ENV === "production";
  void gateway.capabilities().then(async (q) => {
    app.log.info({ qloo: q.state }, "qloo readiness");
    if (!seedDemos || q.state !== "ok" || !dataDb || !profiles) return;
    await ensureDemoProfiles({
      db: dataDb.drizzle,
      profiles,
      resolutions: createResolutionStore(dataDb.drizzle),
      taste: createTasteStore(dataDb.drizzle),
      sessions: createSessionStore(dataDb.drizzle),
      gateway,
      llm,
      log: app.log,
    }).catch((err: unknown) =>
      app.log.warn({ code: (err as { code?: string }).code ?? "error" }, "demo seeding failed"),
    );
  });
}

main().catch((err: unknown) => {
  // Startup errors only (bad env, port in use). Env values are never part of these messages.
  process.stderr.write(
    `agent failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
