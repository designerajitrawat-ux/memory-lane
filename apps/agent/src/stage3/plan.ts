import type { Session, TasteItem } from "@memory-lane/shared";
import type { QlooGateway } from "../qloo/gateway";
import { avoidMatcher } from "../stage2/avoid";
import type { TasteStore } from "../stage2/store";
import { adapt, type Adaptation } from "../stage4/adapt";
import { composeSession } from "./compose";
import type { SessionStore } from "./store";
import { validateSessionItems } from "./validate";

export interface PlanDeps {
  taste: TasteStore;
  sessions: SessionStore;
  /** Stage 4 asks Qloo for more like what landed; without it, sessions adapt by weights only. */
  gateway?: Pick<QlooGateway, "call">;
  allowCall?: () => boolean;
  budgetReserve?: number;
  /** Demo personas: Qloo answers are cached without expiry. Server-side only. */
  persistent?: boolean;
}

export type PlanResult =
  | { kind: "planned"; session: Session; reused?: boolean }
  | { kind: "no_taste_profile" }
  | { kind: "nothing_to_plan" };

const NO_GATEWAY: Pick<QlooGateway, "call"> = {
  call: async () => ({ kind: "unavailable", message: "" }),
};

/**
 * Plans the next session (docs/05 Stages 4 + 3): learn from the last session's reactions (weights,
 * Qloo neighbours of what landed, learned avoid items, "what changed"), then fill the template from the
 * newest taste profile and validate every item. Shared by the route and the demo seeder.
 */
export async function planNextSession(
  input: { profileId: string; nickname: string | null },
  deps: PlanDeps,
): Promise<PlanResult> {
  const { profileId } = input;
  const [taste, ctx, recent, existing] = await Promise.all([
    deps.taste.latest(profileId),
    deps.taste.context(profileId),
    deps.sessions.lastSessionEntities(profileId),
    deps.sessions.list(profileId),
  ]);
  if (!taste || taste.items.length === 0) return { kind: "no_taste_profile" };
  // Nothing played since the last plan: that plan still stands (no Qloo calls, no pile of plans).
  const waiting = await deps.sessions.unplayed(profileId, taste.id);
  if (waiting) return { kind: "planned", session: waiting, reused: true };
  const sessionNumber = (existing[0]?.number ?? 0) + 1;

  let profile = taste;
  let learned: Adaptation | null = null;
  if (existing.length > 0 && ctx) {
    learned = await adapt(
      {
        profileId,
        nickname: input.nickname,
        profile: taste,
        ctx,
        reactions: await deps.sessions.reactions(profileId),
        lastSessionNumber: existing[0]?.number ?? 0,
        recent,
      },
      {
        gateway: deps.gateway ?? NO_GATEWAY,
        store: deps.taste,
        allowCall: () => !!deps.gateway && (deps.allowCall?.() ?? true),
        budgetReserve: deps.budgetReserve ?? 0,
        persistent: deps.persistent ?? false,
      },
    );
    await deps.sessions.addLearnedAvoid(profileId, learned.learnedAvoid);
    if (learned.learnedItems.length || learned.rankEvidence.size) {
      // Items Qloo re-ranked carry that call as evidence (replacing an older ranking, so the list
      // doesn't grow with every session), and the drawer shows why they lead.
      const rankEvidence = learned.rankEvidence;
      const allIds = [...new Set(taste.items.flatMap((i) => i.evidenceIds))];
      const olderRanks = new Set(
        rankEvidence.size
          ? (await deps.taste.evidence(profileId, allIds))
              .filter((e) => e.tool === "qloo_rank")
              .map((e) => e.id)
          : [],
      );
      const withRank = (i: TasteItem): TasteItem => {
        const id = rankEvidence.get(i.entityId);
        if (!id) return i;
        const kept = i.evidenceIds.filter((e) => !olderRanks.has(e) && e !== id);
        return { ...i, evidenceIds: [...kept, id] };
      };
      profile = await deps.taste.save(profileId, {
        era: taste.era,
        partial: taste.partial,
        items: [...taste.items, ...learned.learnedItems].map(withRank),
        notes: learned.learnedItems.length
          ? [
              ...taste.notes,
              `Learned from session ${sessionNumber - 1}: ${learned.learnedItems.map((i) => i.name).join(", ")}.`,
            ]
          : taste.notes,
        steps: taste.steps,
      });
    }
  }

  const composed = composeSession({
    profile,
    sessionNumber,
    recent,
    ...(learned ? { weights: learned.weights, favouriteDomain: learned.favouriteDomain } : {}),
  });
  const { kept } = validateSessionItems(
    composed,
    profile.items,
    avoidMatcher([...(ctx?.avoid ?? []), ...(learned?.learnedAvoid.map((a) => a.text) ?? [])]),
    sessionNumber,
  );
  if (kept.length === 0) return { kind: "nothing_to_plan" };
  const session = await deps.sessions.create(
    profileId,
    profile.id,
    kept,
    learned?.whatChanged ?? [],
  );
  return { kind: "planned", session };
}
