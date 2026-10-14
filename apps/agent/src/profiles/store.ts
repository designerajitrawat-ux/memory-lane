import { and, asc, count, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type {
  DemoProfile,
  ProfileInputParsed,
  ProfileSummary,
  ProfileView,
  TasteItem,
} from "@memory-lane/shared";
import {
  avoidItems,
  budget,
  profiles,
  qlooCalls,
  seeds,
  sessions,
  tasteProfiles,
} from "../db/schema";
import type { AppDb } from "../db/types";

type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];

export interface StoredProfile {
  view: ProfileView;
  isOwner: boolean;
}

/** Thrown inside the create transaction (which rolls back) when a profile limit is reached. */
export class ProfileLimitError extends Error {
  constructor(readonly scope: "owner" | "daily") {
    super(`profile limit reached (${scope})`);
  }
}

export interface ProfileStore {
  create(
    input: ProfileInputParsed,
    ownerTokenHash: string,
    opts?: { isDemo?: boolean },
  ): Promise<ProfileView>;
  /** Owner (by token hash) or demo only: anything else is indistinguishable from "not found". */
  get(id: string, ownerTokenHash: string | null): Promise<StoredProfile | null>;
  listByOwner(ownerTokenHash: string): Promise<ProfileSummary[]>;
  /** The public demo personas, oldest first. */
  listDemos(): Promise<DemoProfile[]>;
  ownerHasProfiles(ownerTokenHash: string): Promise<boolean>;
  /** Deletes the profile (seeds and avoid items cascade) only if this owner holds it. */
  delete(id: string, ownerTokenHash: string): Promise<boolean>;
  /**
   * A private copy of a demo persona for this owner, as it was before any session: its confirmed
   * favourites, the caregiver's avoid-list and the first Life Taste Profile, with copies of the Qloo
   * call records behind them (so the copy stands alone if the demo is rebuilt). Counts toward the
   * same limits as a new profile. Null when it isn't a ready demo.
   */
  copyDemo(demoId: string, ownerTokenHash: string): Promise<{ profileId: string } | null>;
}

export interface ProfileLimits {
  /** Non-demo profiles one owner token may hold. */
  perOwner: number;
  /** New profiles per UTC day across everyone (Neon free storage, abuse). */
  perDay: number;
}

const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

export function createProfileStore(
  db: AppDb,
  limits: ProfileLimits = { perOwner: 20, perDay: 200 },
  now: () => number = Date.now,
): ProfileStore {
  async function children(id: string) {
    return Promise.all([
      db.select().from(seeds).where(eq(seeds.profileId, id)).orderBy(asc(seeds.position)),
      db
        .select()
        .from(avoidItems)
        .where(eq(avoidItems.profileId, id))
        .orderBy(asc(avoidItems.position)),
    ]);
  }

  function toView(
    p: typeof profiles.$inferSelect,
    seedRows: (typeof seeds.$inferSelect)[],
    avoidRows: (typeof avoidItems.$inferSelect)[],
  ): ProfileView {
    return {
      id: p.id,
      nickname: p.nickname,
      birthYear: p.birthYear,
      languages: p.languages,
      lifeStages: p.lifeStages,
      isDemo: p.isDemo,
      createdAt: p.createdAt.toISOString(),
      seeds: seedRows.map((s) => ({
        id: s.id,
        domain: s.domain as ProfileView["seeds"][number]["domain"],
        rawText: s.rawText,
        status: s.status as ProfileView["seeds"][number]["status"],
        note: s.note as ProfileView["seeds"][number]["note"],
        displayName: s.displayName,
      })),
      avoid: avoidRows.map((a) => ({ id: a.id, text: a.text, reason: a.reason })),
    };
  }

  /** The per-owner and global daily limits for a new (non-demo) profile; throws inside `tx`. */
  async function takeProfileSlot(tx: Tx, ownerTokenHash: string) {
    const [owned] = await tx
      .select({ n: count() })
      .from(profiles)
      .where(and(eq(profiles.ownerTokenHash, ownerTokenHash), eq(profiles.isDemo, false)));
    if ((owned?.n ?? 0) >= limits.perOwner) throw new ProfileLimitError("owner");
    // Atomic check-and-increment of today's global counter; no row back = cap reached.
    const counted = await tx
      .insert(budget)
      .values({ day: utcDay(now()), profilesCreated: 1 })
      .onConflictDoUpdate({
        target: budget.day,
        set: { profilesCreated: sql`${budget.profilesCreated} + 1` },
        setWhere: lt(budget.profilesCreated, limits.perDay),
      })
      .returning({ n: budget.profilesCreated });
    if (counted.length === 0) throw new ProfileLimitError("daily");
  }

  return {
    async create(input, ownerTokenHash, opts = {}) {
      const isDemo = opts.isDemo ?? false;
      const id = await db.transaction(async (tx) => {
        if (!isDemo) await takeProfileSlot(tx, ownerTokenHash);
        const [p] = await tx
          .insert(profiles)
          .values({
            ownerTokenHash,
            nickname: input.nickname ?? null,
            birthYear: input.birthYear,
            languages: input.languages,
            lifeStages: input.lifeStages,
            isDemo,
          })
          .returning({ id: profiles.id });
        if (!p) throw new Error("profile insert returned no row");
        if (input.favourites.length) {
          await tx.insert(seeds).values(
            input.favourites.map((f, position) => ({
              profileId: p.id,
              position,
              rawText: f.text,
              domain: f.domain,
            })),
          );
        }
        if (input.avoid.length) {
          await tx.insert(avoidItems).values(
            input.avoid.map((a, position) => ({
              profileId: p.id,
              position,
              text: a.text,
              reason: a.reason ?? null,
            })),
          );
        }
        return p.id;
      });
      const [p] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
      if (!p) throw new Error("profile vanished after insert");
      const [seedRows, avoidRows] = await children(id);
      return toView(p, seedRows, avoidRows);
    },

    async get(id, ownerTokenHash) {
      // Ownership is decided in SQL, so "not yours" and "doesn't exist" cost the same.
      const visible = ownerTokenHash
        ? or(eq(profiles.isDemo, true), eq(profiles.ownerTokenHash, ownerTokenHash))
        : eq(profiles.isDemo, true);
      const [p] = await db
        .select()
        .from(profiles)
        .where(and(eq(profiles.id, id), visible))
        .limit(1);
      if (!p) return null;
      const isOwner = !!ownerTokenHash && p.ownerTokenHash === ownerTokenHash;
      if (isOwner) {
        await db
          .update(profiles)
          .set({ lastSeenAt: sql`now()` })
          .where(eq(profiles.id, id));
      }
      const [seedRows, avoidRows] = await children(id);
      return { view: toView(p, seedRows, avoidRows), isOwner };
    },

    async listByOwner(ownerTokenHash) {
      const mine = and(eq(profiles.ownerTokenHash, ownerTokenHash), eq(profiles.isDemo, false));
      await db
        .update(profiles)
        .set({ lastSeenAt: sql`now()` })
        .where(mine);
      const rows = await db
        .select({
          id: profiles.id,
          nickname: profiles.nickname,
          birthYear: profiles.birthYear,
          isDemo: profiles.isDemo,
          createdAt: profiles.createdAt,
        })
        .from(profiles)
        .where(mine)
        .orderBy(desc(profiles.createdAt))
        .limit(50);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    },

    async listDemos() {
      // Only personas the seeder finished (a taste profile and both sessions; review W15/W2), and while
      // a new version is being built, just the newest complete one of each.
      const rows = await db
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.isDemo, true),
            sql`exists (select 1 from ${tasteProfiles} where ${tasteProfiles.profileId} = ${profiles.id})`,
            sql`(select count(*) from ${sessions} where ${sessions.profileId} = ${profiles.id}) >= 2`,
          ),
        )
        .orderBy(desc(profiles.createdAt));
      const newest = new Map<string, (typeof rows)[number]>();
      for (const p of rows) {
        const key = p.nickname ?? p.id;
        if (!newest.has(key)) newest.set(key, p);
      }
      const out: DemoProfile[] = [];
      for (const p of [...newest.values()].reverse()) {
        const [seedRows] = await children(p.id);
        const [latest] = await db
          .select({ id: sessions.id })
          .from(sessions)
          .where(eq(sessions.profileId, p.id))
          .orderBy(desc(sessions.number))
          .limit(1);
        out.push({
          id: p.id,
          nickname: p.nickname,
          birthYear: p.birthYear,
          regions: p.lifeStages.map((s) => s.region),
          favourites: seedRows
            .filter((s) => s.status === "confirmed")
            .slice(0, 4)
            .map((s) => s.displayName ?? s.rawText),
          latestSessionId: latest?.id ?? null,
        });
      }
      return out;
    },

    async ownerHasProfiles(ownerTokenHash) {
      const rows = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.ownerTokenHash, ownerTokenHash), eq(profiles.isDemo, false)))
        .limit(1);
      return rows.length > 0;
    },

    async copyDemo(demoId, ownerTokenHash) {
      const [demo] = await db
        .select()
        .from(profiles)
        .where(and(eq(profiles.id, demoId), eq(profiles.isDemo, true)))
        .limit(1);
      if (!demo) return null;
      const [first] = await db
        .select()
        .from(tasteProfiles)
        .where(eq(tasteProfiles.profileId, demoId))
        .orderBy(asc(tasteProfiles.version))
        .limit(1);
      if (!first) return null;
      const seedRows = await db
        .select()
        .from(seeds)
        .where(and(eq(seeds.profileId, demoId), eq(seeds.status, "confirmed")))
        .orderBy(asc(seeds.position));
      const avoidRows = await db
        .select()
        .from(avoidItems)
        .where(and(eq(avoidItems.profileId, demoId), eq(avoidItems.source, "caregiver")))
        .orderBy(asc(avoidItems.position));
      const items = first.items as TasteItem[];
      const evidenceIds = [
        ...new Set([
          ...seedRows.flatMap((s) => (s.evidenceId ? [s.evidenceId] : [])),
          ...items.flatMap((i) => i.evidenceIds),
        ]),
      ];
      const calls = evidenceIds.length
        ? await db
            .select()
            .from(qlooCalls)
            .where(and(eq(qlooCalls.profileId, demoId), inArray(qlooCalls.id, evidenceIds)))
        : [];

      return db.transaction(async (tx) => {
        await takeProfileSlot(tx, ownerTokenHash);
        const [copy] = await tx
          .insert(profiles)
          .values({
            ownerTokenHash,
            nickname: demo.nickname,
            birthYear: demo.birthYear,
            languages: demo.languages,
            lifeStages: demo.lifeStages,
          })
          .returning({ id: profiles.id });
        if (!copy) throw new Error("profile insert returned no row");
        // Each Qloo record is copied as it was (same answer, same time), under the new profile.
        const newId = new Map<string, string>();
        for (const call of calls) {
          const [row] = await tx
            .insert(qlooCalls)
            .values({
              profileId: copy.id,
              tool: call.tool,
              argsChecked: call.argsChecked,
              status: call.status,
              summary: call.summary,
              resultCount: call.resultCount,
              resultsDigest: call.resultsDigest,
              cached: call.cached,
              latencyMs: call.latencyMs,
              createdAt: call.createdAt,
            })
            .returning({ id: qlooCalls.id });
          if (row) newId.set(call.id, row.id);
        }
        const seedCopies = seedRows.flatMap((seed) => {
          const evidenceId = seed.evidenceId ? newId.get(seed.evidenceId) : undefined;
          return evidenceId
            ? [
                {
                  profileId: copy.id,
                  position: seed.position,
                  rawText: seed.rawText,
                  domain: seed.domain,
                  qlooEntityId: seed.qlooEntityId,
                  qlooEntityType: seed.qlooEntityType,
                  displayName: seed.displayName,
                  year: seed.year,
                  description: seed.description,
                  status: seed.status,
                  source: seed.source,
                  evidenceId,
                },
              ]
            : [];
        });
        if (seedCopies.length) await tx.insert(seeds).values(seedCopies);
        if (avoidRows.length) {
          await tx.insert(avoidItems).values(
            avoidRows.map((a) => ({
              profileId: copy.id,
              position: a.position,
              text: a.text,
              qlooEntityId: a.qlooEntityId,
              reason: a.reason,
              source: a.source,
            })),
          );
        }
        const copiedItems = items.flatMap((item) => {
          const ids = item.evidenceIds.flatMap((e) => newId.get(e) ?? []);
          return ids.length ? [{ ...item, evidenceIds: ids }] : [];
        });
        await tx.insert(tasteProfiles).values({
          profileId: copy.id,
          version: 1,
          eraFrom: first.eraFrom,
          eraTo: first.eraTo,
          partial: first.partial,
          items: copiedItems,
          notes: first.notes,
          steps: first.steps,
        });
        return { profileId: copy.id };
      });
    },

    async delete(id, ownerTokenHash) {
      const rows = await db
        .delete(profiles)
        .where(
          and(
            eq(profiles.id, id),
            eq(profiles.ownerTokenHash, ownerTokenHash),
            eq(profiles.isDemo, false),
          ),
        )
        .returning({ id: profiles.id });
      return rows.length > 0;
    },
  };
}
