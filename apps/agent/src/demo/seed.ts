import { eq } from "drizzle-orm";
import { ProfileInputSchema } from "@memory-lane/shared";
import { profiles as profilesTable } from "../db/schema";
import type { AppDb } from "../db/types";
import type { ProfileStore } from "../profiles/store";
import type { QlooGateway } from "../qloo/gateway";
import { resolveSeeds } from "../stage1/resolve";
import type { ResolutionStore } from "../stage1/store";
import { buildTasteProfile } from "../stage2/build";
import type { TasteStore } from "../stage2/store";
import { planNextSession } from "../stage3/plan";
import type { SessionStore } from "../stage3/store";
import { DEMO_PERSONAS, demoOwnerHash, type DemoPersona } from "./personas";

export interface SeedDeps {
  db: AppDb;
  profiles: ProfileStore;
  resolutions: ResolutionStore;
  taste: TasteStore;
  sessions: SessionStore;
  gateway: Pick<QlooGateway, "call">;
  log: { info(obj: object, msg: string): void; warn(obj: object, msg: string): void };
}

/**
 * Makes sure the three fictional demo personas exist, fully worked through the real pipeline: Stage 1
 * (the first match of each favourite is taken, as a caregiver would), Stage 2, session 1 with sample
 * reactions, and session 2 planned by Stage 4 from them. Qloo answers are cached without expiry, so
 * this costs Qloo calls once; a persona that already exists is left alone. A persona that fails half
 * way is removed, so the next start tries again.
 */
export async function ensureDemoProfiles(deps: SeedDeps): Promise<void> {
  for (const persona of DEMO_PERSONAS) {
    const ownerHash = demoOwnerHash(persona.key);
    const [existing] = await deps.db
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.ownerTokenHash, ownerHash))
      .limit(1);
    if (existing) continue;
    try {
      await seedPersona(persona, ownerHash, deps);
      deps.log.info({ persona: persona.key }, "demo persona seeded");
    } catch (err) {
      deps.log.warn(
        { persona: persona.key, code: (err as { code?: string }).code ?? "error" },
        "demo persona not seeded",
      );
      await deps.db.delete(profilesTable).where(eq(profilesTable.ownerTokenHash, ownerHash));
    }
  }
}

async function seedPersona(persona: DemoPersona, ownerHash: string, deps: SeedDeps) {
  const input = ProfileInputSchema.parse(persona.input);
  const view = await deps.profiles.create(input, ownerHash, { isDemo: true });
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
  const first = await planNextSession(
    { profileId: view.id, nickname },
    { taste: deps.taste, sessions: deps.sessions, gateway: deps.gateway, persistent: true },
  );
  if (first.kind !== "planned") throw new Error("session 1 not planned");
  for (const [i, item] of first.session.items.entries()) {
    const value = persona.reactions[i];
    if (value) await deps.sessions.react(item.id, ownerHash, value, null);
  }
  await deps.sessions.complete(first.session.id, ownerHash);
  const second = await planNextSession(
    { profileId: view.id, nickname },
    { taste: deps.taste, sessions: deps.sessions, gateway: deps.gateway, persistent: true },
  );
  if (second.kind !== "planned") throw new Error("session 2 not planned");
}
