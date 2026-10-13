import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { profiles, qlooCache, qlooCalls } from "./schema";
import type { AppDb } from "./types";

/** Qloo call records not made for any profile are kept this long, then removed. */
const ORPHAN_EVIDENCE_DAYS = 30;

/**
 * Data retention (docs/07 §2.8): profiles nobody has opened for `profileRetentionDays` are deleted
 * (seeds, avoid items, taste profiles, sessions and their Qloo call records cascade), and expired Qloo
 * cache rows are removed. Demo profiles stay. Qloo call records made for no profile (none are today;
 * a safety net for scripts and future routes) go after 30 days.
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
  const orphanEvidence = await db
    .delete(qlooCalls)
    .where(
      and(
        isNull(qlooCalls.profileId),
        lt(qlooCalls.createdAt, sql`now() - make_interval(days => ${ORPHAN_EVIDENCE_DAYS})`),
      ),
    )
    .returning({ id: qlooCalls.id });
  return {
    profiles: idleProfiles.length,
    cacheRows: expiredCache.length,
    evidenceRows: orphanEvidence.length,
  };
}
