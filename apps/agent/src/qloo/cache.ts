import { createHash } from "node:crypto";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { QlooEnvelopeSchema, type QlooEnvelope } from "@memory-lane/shared";
import { qlooCache } from "../db/schema";
import type { AppDb } from "../db/types";

export interface CacheStore {
  get(key: string): Promise<QlooEnvelope | null>;
  set(entry: {
    key: string;
    tool: string;
    args: unknown;
    envelope: QlooEnvelope;
    expiresAt: Date | null;
  }): Promise<void>;
}

/** sha256(tool + canonical JSON of args): the same args in any key order hit the same entry. */
export function cacheKey(tool: string, args: unknown): string {
  return createHash("sha256")
    .update(`${tool}\n${canonicalJson(args)}`)
    .digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A corrupted or outdated cache row counts as a miss. */
function validEnvelope(value: unknown): QlooEnvelope | null {
  const parsed = QlooEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function createPgCacheStore(db: AppDb): CacheStore {
  return {
    async get(key) {
      const rows = await db
        .select({ envelope: qlooCache.envelope })
        .from(qlooCache)
        .where(
          and(
            eq(qlooCache.key, key),
            or(isNull(qlooCache.expiresAt), gt(qlooCache.expiresAt, sql`now()`)),
          ),
        )
        .limit(1);
      return validEnvelope(rows[0]?.envelope);
    },
    async set({ key, tool, args, envelope, expiresAt }) {
      await db
        .insert(qlooCache)
        .values({ key, tool, args, envelope, expiresAt })
        .onConflictDoUpdate({
          target: qlooCache.key,
          set: { envelope, expiresAt, createdAt: sql`now()` },
        });
    },
  };
}

export function createMemoryCacheStore(now: () => number = Date.now): CacheStore {
  const entries = new Map<string, { envelope: QlooEnvelope; expiresAt: Date | null }>();
  return {
    async get(key) {
      const e = entries.get(key);
      if (!e || (e.expiresAt && e.expiresAt.getTime() <= now())) return null;
      return validEnvelope(e.envelope);
    },
    async set({ key, envelope, expiresAt }) {
      entries.set(key, { envelope, expiresAt });
    },
  };
}
