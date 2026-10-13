import { and, asc, count, desc, eq, lt, or, sql } from "drizzle-orm";
import type {
  DemoProfile,
  ProfileInputParsed,
  ProfileSummary,
  ProfileView,
} from "@memory-lane/shared";
import { avoidItems, budget, profiles, seeds } from "../db/schema";
import type { AppDb } from "../db/types";

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

  return {
    async create(input, ownerTokenHash, opts = {}) {
      const isDemo = opts.isDemo ?? false;
      const id = await db.transaction(async (tx) => {
        if (!isDemo) {
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
      const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.isDemo, true))
        .orderBy(profiles.createdAt);
      const out: DemoProfile[] = [];
      for (const p of rows) {
        const [seedRows] = await children(p.id);
        out.push({
          id: p.id,
          nickname: p.nickname,
          birthYear: p.birthYear,
          regions: p.lifeStages.map((s) => s.region),
          favourites: seedRows
            .filter((s) => s.status === "confirmed")
            .slice(0, 4)
            .map((s) => s.displayName ?? s.rawText),
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
