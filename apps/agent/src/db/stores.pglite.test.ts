import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import recommendOk from "../../test/fixtures/synthetic/qloo_recommend.json";
import { createPgBudgetStore } from "../qloo/budget";
import { createPgCacheStore } from "../qloo/cache";
import { parseEnvelope } from "../qloo/envelope";
import { createPgEvidenceStore } from "../qloo/evidence";
import type { AppDb } from "./types";

// The production SQL (real migrations + drizzle queries) on in-process Postgres: no Docker, no Neon.
const MIGRATIONS = fileURLToPath(new URL("../../drizzle", import.meta.url));
const envelope = parseEnvelope(recommendOk.structuredContent, "qloo_recommend");
let db: AppDb;

beforeAll(async () => {
  const pg = drizzle(new PGlite());
  await migrate(pg, { migrationsFolder: MIGRATIONS });
  db = pg as unknown as AppDb;
}, 30_000);

describe("Postgres stores (PGlite)", () => {
  it("budget: atomic, never exceeds the limit under concurrency", async () => {
    const store = createPgBudgetStore(db, () => Date.UTC(2026, 9, 12));
    const results = await Promise.all(Array.from({ length: 8 }, () => store.tryConsume(5)));
    expect(results.filter(Boolean)).toHaveLength(5);
    expect(await store.usedToday()).toBe(5);
    expect(await store.tryConsume(5)).toBe(false);
    const tomorrow = createPgBudgetStore(db, () => Date.UTC(2026, 9, 13));
    expect(await tomorrow.tryConsume(5)).toBe(true);
  });

  it("cache: honours expiry, keeps persistent entries, upserts", async () => {
    const cache = createPgCacheStore(db);
    await cache.set({
      key: "expired",
      tool: "t",
      args: {},
      envelope,
      expiresAt: new Date(Date.now() - 1000),
    });
    await cache.set({
      key: "fresh",
      tool: "t",
      args: {},
      envelope,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await cache.set({ key: "forever", tool: "t", args: { a: 1 }, envelope, expiresAt: null });
    expect(await cache.get("expired")).toBeNull();
    expect(await cache.get("fresh")).toMatchObject({ status: "ok", result_count: 3 });
    expect(await cache.get("forever")).not.toBeNull();
    await cache.set({ key: "expired", tool: "t", args: {}, envelope, expiresAt: null });
    expect(await cache.get("expired")).not.toBeNull();
  });

  it("evidence: inserts a qloo_calls row and returns its uuid", async () => {
    const store = createPgEvidenceStore(db);
    const id = await store.record({
      tool: "qloo_recommend",
      args: { target_type: "movie" },
      envelope,
      cached: false,
      latencyMs: 42.4,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
