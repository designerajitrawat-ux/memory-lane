import { and, asc, desc, eq, inArray, lte, max } from "drizzle-orm";
import type { TasteItem, TasteProfile } from "@memory-lane/shared";
import { avoidItems, profiles, qlooCalls, seeds, tasteProfiles } from "../db/schema";
import type { AppDb } from "../db/types";
import type { DigestItem } from "../qloo/evidence";

/** A favourite the caregiver confirmed in Stage 1, with what Stage 2 needs to use it as a signal. */
export interface ConfirmedSeed {
  name: string;
  domain: string;
  entityId: string;
  entityType: string | null;
  year: number | null;
  description: string | null;
  evidenceId: string;
}

/** What Stage 2 may know about the person: no nickname (it never reaches Qloo or the AI). */
export interface TasteContext {
  birthYear: number;
  /** Coarse regions as the caregiver typed them, oldest life stage first. */
  regions: string[];
  languages: string[];
  seeds: ConfirmedSeed[];
  avoid: string[];
}

export interface EvidenceRow {
  id: string;
  tool: string;
  status: string;
  digest: DigestItem[];
}

export interface TasteStore {
  context(profileId: string): Promise<TasteContext | null>;
  evidence(profileId: string, ids: readonly string[]): Promise<EvidenceRow[]>;
  latest(profileId: string): Promise<TasteProfile | null>;
  save(
    profileId: string,
    profile: Pick<TasteProfile, "era" | "partial" | "items" | "notes"> & { steps?: string[] },
  ): Promise<TasteProfile>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createTasteStore(db: AppDb): TasteStore {
  const toProfile = (row: typeof tasteProfiles.$inferSelect): TasteProfile => ({
    id: row.id,
    profileId: row.profileId,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    era: { from: row.eraFrom, to: row.eraTo },
    partial: row.partial,
    items: row.items as TasteItem[],
    notes: row.notes as string[],
    steps: (row.steps as string[] | null) ?? [],
  });

  return {
    async context(profileId) {
      const [p] = await db
        .select({
          birthYear: profiles.birthYear,
          languages: profiles.languages,
          lifeStages: profiles.lifeStages,
        })
        .from(profiles)
        .where(eq(profiles.id, profileId))
        .limit(1);
      if (!p) return null;
      const seedRows = await db
        .select()
        .from(seeds)
        .where(and(eq(seeds.profileId, profileId), eq(seeds.status, "confirmed")))
        .orderBy(asc(seeds.position));
      const avoidRows = await db
        .select({ text: avoidItems.text })
        .from(avoidItems)
        .where(eq(avoidItems.profileId, profileId));
      return {
        birthYear: p.birthYear,
        languages: p.languages,
        regions: [...p.lifeStages].sort((a, b) => a.fromYear - b.fromYear).map((s) => s.region),
        seeds: seedRows.flatMap((s) =>
          s.qlooEntityId && s.evidenceId
            ? [
                {
                  name: s.displayName ?? s.rawText,
                  domain: s.domain,
                  entityId: s.qlooEntityId,
                  entityType: s.qlooEntityType,
                  year: s.year,
                  description: s.description,
                  evidenceId: s.evidenceId,
                },
              ]
            : [],
        ),
        avoid: avoidRows.map((a) => a.text),
      };
    },

    async evidence(profileId, ids) {
      // Evidence ids are UUIDs; anything else can't be a record (and would fail the uuid column).
      ids = ids.filter((id) => UUID_RE.test(id));
      if (ids.length === 0) return [];
      const rows = await db
        .select({
          id: qlooCalls.id,
          tool: qlooCalls.tool,
          status: qlooCalls.status,
          digest: qlooCalls.resultsDigest,
        })
        .from(qlooCalls)
        .where(and(eq(qlooCalls.profileId, profileId), inArray(qlooCalls.id, [...ids])));
      return rows.map((r) => ({ ...r, digest: r.digest as DigestItem[] }));
    },

    async latest(profileId) {
      const [row] = await db
        .select()
        .from(tasteProfiles)
        .where(eq(tasteProfiles.profileId, profileId))
        .orderBy(desc(tasteProfiles.version))
        .limit(1);
      return row ? toProfile(row) : null;
    },

    async save(profileId, profile) {
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select({ v: max(tasteProfiles.version) })
          .from(tasteProfiles)
          .where(eq(tasteProfiles.profileId, profileId));
        const [row] = await tx
          .insert(tasteProfiles)
          .values({
            profileId,
            version: (current?.v ?? 0) + 1,
            eraFrom: profile.era.from,
            eraTo: profile.era.to,
            partial: profile.partial,
            items: profile.items,
            notes: profile.notes,
            steps: profile.steps ?? [],
          })
          .returning();
        if (!row) throw new Error("taste profile insert returned no row");
        // Keep the newest three versions; older ones only take space (security review S5).
        await tx
          .delete(tasteProfiles)
          .where(
            and(
              eq(tasteProfiles.profileId, profileId),
              lte(tasteProfiles.version, row.version - 3),
            ),
          );
        return toProfile(row);
      });
    },
  };
}
