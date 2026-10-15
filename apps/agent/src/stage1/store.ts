import { and, asc, eq, inArray } from "drizzle-orm";
import {
  qlooImageOrNull,
  SEED_NOTE_MESSAGES,
  type ConfirmRequest,
  type SeedNote,
  type SeedResolution,
} from "@memory-lane/shared";
import { seedCandidates, seeds } from "../db/schema";
import type { AppDb } from "../db/types";
import { typeLabel } from "./labels";
import type { MappedCandidate } from "./mapDescribe";

export interface PendingSeed {
  id: string;
  rawText: string;
  domain: string;
}

/** Thrown when a confirm decision doesn't match a seed/candidate the agent offered for this profile. */
export class ConfirmError extends Error {}

export interface ResolutionStore {
  pendingSeeds(profileId: string): Promise<PendingSeed[]>;
  saveCandidates(seedId: string, candidates: MappedCandidate[], evidenceId: string): Promise<void>;
  markUnresolved(seedId: string, note: SeedNote): Promise<void>;
  /** The lookup failed this time; the seed stays pending so it can be tried again. */
  markLookupFailed(seedId: string): Promise<void>;
  resolutions(profileId: string): Promise<SeedResolution[]>;
  confirm(profileId: string, decisions: ConfirmRequest["decisions"]): Promise<void>;
}

export function createResolutionStore(db: AppDb): ResolutionStore {
  return {
    async pendingSeeds(profileId) {
      return db
        .select({ id: seeds.id, rawText: seeds.rawText, domain: seeds.domain })
        .from(seeds)
        .where(and(eq(seeds.profileId, profileId), eq(seeds.status, "pending")))
        .orderBy(asc(seeds.position));
    },

    // Every Stage 1 write only touches a seed that is still pending, so a late or parallel run can't undo
    // a confirmation. The guarded update locks the row first, so two runs can't both insert candidates.
    async saveCandidates(seedId, candidates, evidenceId) {
      await db.transaction(async (tx) => {
        const claimed = await tx
          .update(seeds)
          .set({ status: "needs_input", note: null })
          .where(and(eq(seeds.id, seedId), eq(seeds.status, "pending")))
          .returning({ id: seeds.id });
        if (claimed.length === 0) return;
        await tx.delete(seedCandidates).where(eq(seedCandidates.seedId, seedId));
        await tx.insert(seedCandidates).values(
          candidates.map((c, position) => ({
            seedId,
            position,
            entityId: c.entityId,
            name: c.name,
            entityType: c.entityType,
            year: c.year,
            description: c.description,
            imageUrl: qlooImageOrNull(c.image),
            evidenceId,
          })),
        );
      });
    },

    async markUnresolved(seedId, note) {
      await db
        .update(seeds)
        .set({ status: "unresolved", note })
        .where(and(eq(seeds.id, seedId), eq(seeds.status, "pending")));
    },

    async markLookupFailed(seedId) {
      await db
        .update(seeds)
        .set({ note: "lookup_failed" })
        .where(and(eq(seeds.id, seedId), eq(seeds.status, "pending")));
    },

    async resolutions(profileId) {
      const seedRows = await db
        .select()
        .from(seeds)
        .where(eq(seeds.profileId, profileId))
        .orderBy(asc(seeds.position));
      const ids = seedRows.map((s) => s.id);
      const candidateRows = ids.length
        ? await db
            .select()
            .from(seedCandidates)
            .where(inArray(seedCandidates.seedId, ids))
            .orderBy(asc(seedCandidates.position))
        : [];
      return seedRows.map((s) => {
        const note = (s.note as SeedNote | null) ?? null;
        return {
          seedId: s.id,
          rawText: s.rawText,
          status: s.status as SeedResolution["status"],
          candidates:
            s.status === "needs_input"
              ? candidateRows
                  .filter((c) => c.seedId === s.id)
                  .map((c) => ({
                    id: c.id,
                    name: c.name,
                    type: typeLabel(c.entityType),
                    year: c.year,
                    description: c.description,
                    image: qlooImageOrNull(c.imageUrl),
                  }))
              : [],
          note,
          message: note ? SEED_NOTE_MESSAGES[note] : null,
        };
      });
    },

    async confirm(profileId, decisions) {
      await db.transaction(async (tx) => {
        for (const d of decisions) {
          const [seed] = await tx
            .select({ id: seeds.id, status: seeds.status })
            .from(seeds)
            .where(and(eq(seeds.id, d.seedId), eq(seeds.profileId, profileId)))
            .limit(1);
          if (!seed || seed.status !== "needs_input")
            throw new ConfirmError("seed not awaiting a choice");
          if (d.candidateId === null) {
            await tx.update(seeds).set({ status: "rejected" }).where(eq(seeds.id, seed.id));
            await tx.delete(seedCandidates).where(eq(seedCandidates.seedId, seed.id));
            continue;
          }
          const [c] = await tx
            .select()
            .from(seedCandidates)
            .where(and(eq(seedCandidates.id, d.candidateId), eq(seedCandidates.seedId, seed.id)))
            .limit(1);
          if (!c) throw new ConfirmError("candidate not offered for this seed");
          await tx
            .update(seeds)
            .set({
              status: "confirmed",
              qlooEntityId: c.entityId,
              qlooEntityType: c.entityType,
              displayName: c.name,
              year: c.year,
              description: c.description,
              imageUrl: qlooImageOrNull(c.imageUrl),
              evidenceId: c.evidenceId,
            })
            .where(eq(seeds.id, seed.id));
          // The choice is made: the other matches aren't needed any more (data minimisation).
          await tx.delete(seedCandidates).where(eq(seedCandidates.seedId, seed.id));
        }
      });
    },
  };
}
