import { eq, lt, sql } from "drizzle-orm";
import { budget } from "../db/schema";
import type { AppDb } from "../db/types";

/** Daily Qloo call budget protecting the shared hackathon quota (docs/03 §6.6). */
export interface BudgetStore {
  /** Atomically takes one live call from today's budget; false when it is used up. */
  tryConsume(limit: number): Promise<boolean>;
  usedToday(): Promise<number>;
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export function createPgBudgetStore(db: AppDb, now: () => number = Date.now): BudgetStore {
  return {
    async tryConsume(limit) {
      if (limit <= 0) return false;
      // Insert the day with 1, or add 1 only while still under the limit. No row back = over budget.
      const rows = await db
        .insert(budget)
        .values({ day: utcDay(now()), qlooCalls: 1 })
        .onConflictDoUpdate({
          target: budget.day,
          set: { qlooCalls: sql`${budget.qlooCalls} + 1` },
          setWhere: lt(budget.qlooCalls, limit),
        })
        .returning({ qlooCalls: budget.qlooCalls });
      return rows.length > 0;
    },
    async usedToday() {
      const rows = await db
        .select({ qlooCalls: budget.qlooCalls })
        .from(budget)
        .where(eq(budget.day, utcDay(now())))
        .limit(1);
      return rows[0]?.qlooCalls ?? 0;
    },
  };
}

export function createMemoryBudgetStore(now: () => number = Date.now): BudgetStore {
  const used = new Map<string, number>();
  return {
    async tryConsume(limit) {
      const day = utcDay(now());
      const n = used.get(day) ?? 0;
      if (n >= limit) return false;
      used.set(day, n + 1);
      return true;
    },
    async usedToday() {
      return used.get(utcDay(now())) ?? 0;
    },
  };
}

/** Sliding-window limit on live Qloo calls per key (profile now, client IP in Phase 3). In memory. */
export function createRateLimiter(
  { max, windowMs }: { max: number; windowMs: number },
  now: () => number = Date.now,
) {
  const hits = new Map<string, number[]>();
  return {
    tryTake(key: string): boolean {
      const t = now();
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.every((h) => t - h >= windowMs)) hits.delete(k);
      }
      const recent = (hits.get(key) ?? []).filter((h) => t - h < windowMs);
      if (recent.length >= max) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
