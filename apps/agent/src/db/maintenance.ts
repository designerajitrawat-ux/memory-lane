import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { profiles, qlooCache } from "./schema";
import type { AppDb } from "./types";

/**
 * Data retention (docs/07 §2.8): profiles nobody has opened for `profileRetentionDays` are deleted
 * (seeds and avoid items cascade), and expired Qloo cache rows are removed. Demo profiles stay.
 * Evidence rows (qloo_calls) are kept for now; Phase 4 links them to sessions and purges unreferenced ones.
 */
export async function purgeStaleData(
  db: AppDb,
  { profileRetentionDays }: { profileRetentionDays: number },
) {
  const idleProfiles = await db
    .delete(profiles)
    .where(
      and(
        eq(profiles.isDemo, false),
        lt(profiles.lastSeenAt, sql`now() - make_interval(days => ${profileRetentionDays})`),
      ),
    )
    .returning({ id: profiles.id });
  const expiredCache = await db
    .delete(qlooCache)
    .where(and(isNotNull(qlooCache.expiresAt), lt(qlooCache.expiresAt, sql`now()`)))
    .returning({ key: qlooCache.key });
  return { profiles: idleProfiles.length, cacheRows: expiredCache.length };
}
