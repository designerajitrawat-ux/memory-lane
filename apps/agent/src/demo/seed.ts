import { and, count, eq, like, ne, or } from "drizzle-orm";
import { ProfileInputSchema } from "@memory-lane/shared";
import { profiles as profilesTable, sessions as sessionsTable, tasteProfiles } from "../db/schema";
import type { AppDb } from "../db/types";
import type { ProfileStore } from "../profiles/store";
import type { QlooGateway } from "../qloo/gateway";
import { resolveSeeds } from "../stage1/resolve";
import type { ResolutionStore } from "../stage1/store";
import { buildTasteProfile } from "../stage2/build";
import type { TasteStore } from "../stage2/store";
import { planNextSession } from "../stage3/plan";
import type { SessionStore } from "../stage3/store";
import { DEMO_PERSONAS, demoOwnerHash, demoOwnerPrefix, type DemoPersona } from "./personas";

export interface SeedDeps {
  db: AppDb;
  profiles: ProfileStore;
  resolutions: ResolutionStore;
  taste: TasteStore;
  sessions: SessionStore;
  gateway: Pick<QlooGateway, "call">;
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void };
  /** For tests. */
  now?: () => number;
}

/** A persona still being built this long after it was started was interrupted (a restart mid-seed). */
export const STALE_SEED_MS = 15 * 60 * 1000;

/**
 * Makes sure the three fictional demo personas exist, fully worked through the real pipeline: Stage 1
 * (the first match of each favourite is taken, as a caregiver would), Stage 2, session 1 with sample
 * reactions, and session 2 planned by Stage 4 from them. Qloo answers are cached without expiry, so
 * this costs Qloo calls once per persona version.
 *
 * Robust to restarts and overlapping deploys (security review W2): a persona counts only once it is
 * complete (a taste profile and two sessions; the demo list shows nothing less); one left half-built
 * by a restart is rebuilt once it is stale; a second instance seeding at the same moment loses on the
 * unique demo index and leaves the first alone; an older version is removed only after the current
 * one is complete, so the demo list is never empty during a redeploy.
 */
export async function ensureDemoProfiles(deps: SeedDeps): Promise<void> {
  const now = deps.now ?? Date.now;
  for (const persona of DEMO_PERSONAS) {
    const ownerHash = demoOwnerHash(persona.key);
    const [existing] = await deps.db
      .select({ id: profilesTable.id, createdAt: profilesTable.createdAt })
      .from(profilesTable)
      .where(eq(profilesTable.ownerTokenHash, ownerHash))
      .limit(1);
    if (existing) {
      if (await demoComplete(deps.db, existing.id)) {
        await removeOlderVersions(deps.db, persona.key);
        continue;
      }
      if (now() - existing.createdAt.getTime() < STALE_SEED_MS) continue; // being seeded elsewhere
      await deps.db.delete(profilesTable).where(eq(profilesTable.id, existing.id));
      deps.log.info({ persona: persona.key }, "demo persona was left half-built; seeding again");
    }
    let createdId: string | null = null;
    try {
      await seedPersona(persona, ownerHash, deps, (id) => {
        createdId = id;
      });
      await removeOlderVersions(deps.db, persona.key);
      deps.log.info({ persona: persona.key }, "demo persona seeded");
    } catch (err) {
      const code = errorCode(err);
      if (code === "23505") {
        // Another instance started this persona a moment earlier; it carries on.
        deps.log.info({ persona: persona.key }, "demo persona is being seeded elsewhere");
        continue;
      }
      deps.log.warn({ persona: persona.key, code: code ?? "error" }, "demo persona not seeded");
      // Only what this run created; the next start tries again.
      if (createdId) {
        await deps.db.delete(profilesTable).where(eq(profilesTable.id, createdId));
      }
    }
  }
}

/** A demo persona is shown only once it has a taste profile and both sessions. */
export async function demoComplete(db: AppDb, profileId: string): Promise<boolean> {
  const [taste] = await db
    .select({ n: count() })
    .from(tasteProfiles)
    .where(eq(tasteProfiles.profileId, profileId));
  const [planned] = await db
    .select({ n: count() })
    .from(sessionsTable)
    .where(eq(sessionsTable.profileId, profileId));
  return (taste?.n ?? 0) > 0 && (planned?.n ?? 0) >= 2;
}

/** Earlier versions of a persona (built by older code), once the current one is complete. */
async function removeOlderVersions(db: AppDb, key: string) {
  await db.delete(profilesTable).where(
    and(
      eq(profilesTable.isDemo, true),
      // The first version had no suffix; later ones end ":v<n>" (never another persona's key).
      or(
        eq(profilesTable.ownerTokenHash, demoOwnerPrefix(key)),
        like(profilesTable.ownerTokenHash, `${demoOwnerPrefix(key)}:v%`),
      ),
      ne(profilesTable.ownerTokenHash, demoOwnerHash(key)),
    ),
  );
}

function errorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

async function seedPersona(
  persona: DemoPersona,
  ownerHash: string,
  deps: SeedDeps,
  onCreated: (id: string) => void,
) {
  const input = ProfileInputSchema.parse(persona.input);
  const view = await deps.profiles.create(input, ownerHash, { isDemo: true });
  onCreated(view.id);
  const nickname = view.nickname;
  const quiet = () => {};

  // Stage 1, taking the first match of each favourite.
  await resolveSeeds(
    { profileId: view.id, nickname },
    { gateway: deps.gateway, store: deps.resolutions, persistent: true },
    quiet,
  );
  const decisions = (await deps.resolutions.resolutions(view.id))
    .filter((r) => r.status === "needs_input" && r.candidates[0])
    .map((r) => ({ seedId: r.seedId, candidateId: r.candidates[0]?.id ?? null }));
  if (decisions.length === 0) throw new Error("no favourite resolved");
  await deps.resolutions.confirm(view.id, decisions);

  // Stage 2.
  const profile = await buildTasteProfile(
    { profileId: view.id, nickname },
    { gateway: deps.gateway, store: deps.taste, persistent: true },
    quiet,
  );
  if (!profile) throw new Error("taste profile not built");

  // Session 1 with sample reactions, then session 2 learned from them.
  const plan = () =>
    planNextSession(
      { profileId: view.id, nickname },
      { taste: deps.taste, sessions: deps.sessions, gateway: deps.gateway, persistent: true },
    );
  const first = await plan();
  if (first.kind !== "planned") throw new Error("session 1 not planned");
  for (const [i, item] of first.session.items.entries()) {
    const value = persona.reactions[i];
    if (value) await deps.sessions.react(item.id, ownerHash, value, null, { seeding: true });
  }
  await deps.sessions.complete(first.session.id, ownerHash, { seeding: true });
  const second = await plan();
  if (second.kind !== "planned" || second.reused) throw new Error("session 2 not planned");
}
