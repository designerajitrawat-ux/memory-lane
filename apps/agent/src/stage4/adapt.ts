import type { Reaction, TasteDomain, TasteItem, TasteProfile } from "@memory-lane/shared";
import type { GatewayResult, QlooGateway } from "../qloo/gateway";
import { typeLabel } from "../stage1/labels";
import { normalise } from "../stage1/mapDescribe";
import { avoidMatcher } from "../stage2/avoid";
import {
  HEAVY,
  HEAVY_SCREEN,
  PLACEMENT_ORDER,
  found,
  join,
  read,
  readRecommend,
  type Found,
} from "../stage2/build";
import { bumpDistance, eraFor, eraPlacement, yearFits } from "../stage2/era";
import type { TasteContext, TasteStore } from "../stage2/store";
import { validateTasteItems } from "../stage2/validators";
import type { ReactedItem } from "../stage3/store";

/** How much one reaction moves an item (Stage 4, docs/05): ≤ -1 means it never comes back. */
const WEIGHT: Record<Reaction, number> = { sang: 2, engaged: 1, neutral: -0.5, distressed: -100 };
/** Learned items start a little ahead of the rest of their domain… */
export const LEARNED_BOOST = 1;
/** …and Qloo's ranking against what landed decides the order: top gets this much, the last none. */
export const RANK_BOOST = 1.5;
const PER_DOMAIN = 2;
/** qloo_rank takes at most 10 options. */
const RANK_OPTIONS = 10;
const TOOLS = ["qloo_recommend", "qloo_rank"] as const;

const DOMAIN_WORDS: Record<TasteDomain, string> = {
  music: "music",
  film_tv: "films and TV",
  food: "food",
  places: "places",
};

export interface AdaptInput {
  profileId: string;
  nickname: string | null;
  profile: TasteProfile;
  ctx: TasteContext;
  /** Every logged reaction, from every session. */
  reactions: ReactedItem[];
  /** The session just before the one being planned (0 when there is none). */
  lastSessionNumber: number;
  /** Entities of that session, played or not: Qloo ranks only what is still to play. */
  recent?: ReadonlySet<string>;
}

export interface AdaptDeps {
  gateway: Pick<QlooGateway, "call">;
  store: TasteStore;
  allowCall?: () => boolean;
  budgetReserve?: number;
  /** Demo personas: Qloo answers are cached without expiry. Server-side only. */
  persistent?: boolean;
}

export interface Adaptation {
  weights: Map<string, number>;
  favouriteDomain: TasteDomain | null;
  /** New items Qloo found from what landed well, already validated (evidence, avoid, wording). */
  learnedItems: TasteItem[];
  /** The qloo_rank record behind each item Qloo re-ordered (its evidence joins the item's own). */
  rankEvidence: Map<string, string>;
  /** Items that seemed to upset them: they join the avoid-list (the reason is owner-only). */
  learnedAvoid: { text: string; reason: string }[];
  /** 2–5 plain sentences for the caregiver ("What changed since last time"). */
  whatChanged: string[];
}

/**
 * Stage 4 (docs/05 §2): learn from the last session's reactions before the next one is planned.
 * Sang/engaged → more weight, Qloo is asked for neighbours of those exact entities, and Qloo ranks
 * what is still to play (plus what it just found) against them, so Qloo decides what comes next (≤4
 * calls, same guard, evidence and filters as Stage 2); neutral → less weight; distressed → never
 * again, and onto the avoid-list. The result says, in plain words, what changed.
 */
export async function adapt(input: AdaptInput, deps: AdaptDeps): Promise<Adaptation> {
  const weights = new Map<string, number>();
  for (const r of input.reactions) {
    weights.set(r.entityId, (weights.get(r.entityId) ?? 0) + WEIGHT[r.reaction]);
  }
  const last = input.reactions.filter((r) => r.sessionNumber === input.lastSessionNumber);
  if (last.length === 0) {
    return {
      weights,
      favouriteDomain: null,
      learnedItems: [],
      rankEvidence: new Map(),
      learnedAvoid: [],
      whatChanged:
        input.lastSessionNumber > 0
          ? [
              "No reactions were logged last time, so this session comes from the profile, with things not played yet.",
            ]
          : [],
    };
  }

  const loved = last.filter((r) => r.reaction === "sang" || r.reaction === "engaged");
  const upset = last.filter((r) => r.reaction === "distressed");
  const quiet = last.filter((r) => r.reaction === "neutral");

  // The domain that landed best last time leads "your choice".
  const byDomain = new Map<TasteDomain, number>();
  for (const r of last) {
    const d = r.domain as TasteDomain;
    byDomain.set(d, (byDomain.get(d) ?? 0) + Math.max(WEIGHT[r.reaction], -1));
  }
  const best = [...byDomain.entries()].sort((a, b) => b[1] - a[1])[0];
  const favouriteDomain = best && best[1] > 0 ? best[0] : null;

  const learnedAvoid = upset.map((r) => ({
    text: r.name,
    reason: `Seemed upset during session ${r.sessionNumber}.`,
  }));
  const isAvoided = avoidMatcher([...input.ctx.avoid, ...learnedAvoid.map((a) => a.text)]);

  // Ask Qloo for more like what landed (entities only: tags can't be signals).
  const era = eraFor(input.ctx.birthYear);
  const lovedEntities = loved.filter((r) => r.entityType?.startsWith("urn:entity:"));
  const music = lovedEntities.filter((r) => r.domain === "music").slice(0, 3);
  const screen = lovedEntities.filter((r) => r.domain === "film_tv").slice(0, 3);
  // Ids the server read from its own records: the reacted items and this profile's items.
  const trustedIds = new Set(
    [...lovedEntities.map((r) => r.entityId), ...input.profile.items.map((i) => i.entityId)].map(
      (id) => id.toLowerCase(),
    ),
  );
  const call = async (
    tool: (typeof TOOLS)[number],
    args: Record<string, unknown>,
  ): Promise<GatewayResult | "refused"> => {
    if (deps.allowCall && !deps.allowCall()) return "refused";
    return deps.gateway.call(tool, args, {
      nickname: input.nickname,
      profileId: input.profileId,
      allowedTools: TOOLS,
      reserve: deps.budgetReserve ?? 0,
      trustedIds,
      persistent: deps.persistent ?? false,
    });
  };
  const screenTarget = screen[0]?.entityType?.endsWith(":movie") ? "movie" : "tv_show";
  const [musicRes, screenRes] = await Promise.all([
    music.length
      ? call("qloo_recommend", {
          target_type: "artist",
          signals: music.map((r) => r.entityId),
          limit: 15,
          explain: true,
        })
      : Promise.resolve(null),
    screen.length
      ? call("qloo_recommend", {
          target_type: screenTarget,
          signals: screen.map((r) => r.entityId),
          limit: 20,
          explain: true,
        })
      : Promise.resolve(null),
  ]);

  const have = (f: Found) =>
    input.profile.items.some(
      (i) => i.entityId === f.entityId || normalise(i.name) === normalise(f.name),
    );
  const ok = (f: Found) =>
    !have(f) && !isAvoided(f.name, f.text) && !HEAVY.test(`${f.name} ${f.text}`);

  const musicOutcome = read(musicRes, readRecommend);
  const musicNew = found(musicOutcome)
    .filter(ok)
    .map((f) => ({ f, place: PLACEMENT_ORDER[eraPlacement(f.description, era)] }))
    .filter((x) => x.place < PLACEMENT_ORDER.later)
    .sort((a, b) => a.place - b.place)
    .slice(0, PER_DOMAIN)
    .map((x) =>
      learnedItem(
        x.f,
        "music",
        music.map((r) => r.name),
      ),
    );
  const screenOutcome = read(screenRes, readRecommend);
  const screenNew = found(screenOutcome)
    .filter(ok)
    .filter((f) => yearFits(f.year, era))
    .filter((f) => !HEAVY_SCREEN.test(`${f.name} ${f.text}`))
    .sort((a, b) => bumpDistance(a.year ?? 0, era) - bumpDistance(b.year ?? 0, era))
    .slice(0, PER_DOMAIN)
    .map((f) =>
      learnedItem(
        f,
        "film_tv",
        screen.map((r) => r.name),
      ),
    );

  const candidates = [...musicNew, ...screenNew];
  const evidence = await deps.store.evidence(input.profileId, [
    ...new Set(candidates.flatMap((i) => i.evidenceIds)),
  ]);
  const { kept: learnedItems } = validateTasteItems(candidates, evidence, isAvoided);
  for (const item of learnedItems) {
    weights.set(item.entityId, (weights.get(item.entityId) ?? 0) + LEARNED_BOOST);
    // Ids Qloo just returned to the server (validated against the evidence): rankable like the rest.
    trustedIds.add(item.entityId.toLowerCase());
  }

  // Qloo ranks what is still to play in a domain (plus what it just found) against what landed, and
  // that order leads the next session. Played, upset and tag items aren't ranked.
  const played = new Set([...(input.recent ?? []), ...last.map((r) => r.entityId)]);
  const pool = (domain: TasteDomain, type: string) =>
    [...learnedItems, ...input.profile.items]
      .filter((i) => i.domain === domain && i.entityType === type)
      .filter((i) => !played.has(i.entityId) && (weights.get(i.entityId) ?? 0) > -1)
      .filter((i, n, all) => all.findIndex((x) => x.entityId === i.entityId) === n)
      .slice(0, RANK_OPTIONS);
  const lovedFirst = (domain: string) =>
    [
      ...lovedEntities.filter((r) => r.domain === domain),
      ...lovedEntities.filter((r) => r.domain !== domain),
    ]
      .slice(0, 5)
      .map((r) => r.entityId);
  const musicPool = pool("music", "urn:entity:artist");
  const screenType = `urn:entity:${screenTarget}`;
  const screenPool = pool("film_tv", screenType);
  const rank = (options: TasteItem[], optionType: string, signals: string[]) =>
    options.length >= 2 && signals.length
      ? call("qloo_rank", {
          options: options.map((i) => i.entityId),
          option_type: optionType,
          signals,
        })
      : Promise.resolve(null);
  const [musicRank, screenRank] = await Promise.all([
    rank(musicPool, "artist", lovedFirst("music")),
    rank(screenPool, screenTarget, lovedFirst("film_tv")),
  ]);
  const rankEvidence = new Map<string, string>();
  const ranked = (res: GatewayResult | "refused" | null, options: TasteItem[]): TasteItem[] => {
    const order = rankOrder(res, options);
    if (!order) return [];
    order.items.forEach((item, i) => {
      const share = order.items.length === 1 ? 1 : 1 - i / (order.items.length - 1);
      weights.set(item.entityId, (weights.get(item.entityId) ?? 0) + RANK_BOOST * share);
      rankEvidence.set(item.entityId, order.evidenceId);
    });
    return order.items;
  };
  const musicRanked = ranked(musicRank, musicPool);
  const screenRanked = ranked(screenRank, screenPool);

  // What changed, in plain words (it reports what the caregiver logged; it claims nothing).
  const whatChanged: string[] = [];
  const names = (rs: { name: string }[]) => join(rs.map((r) => r.name));
  const learnedMusic = learnedItems.filter((i) => i.domain === "music");
  const learnedScreen = learnedItems.filter((i) => i.domain === "film_tv");
  if (learnedMusic.length) {
    whatChanged.push(
      `${names(music)} landed well, so Qloo was asked for more like that: ${names(learnedMusic)}.`,
    );
  }
  if (learnedScreen.length) {
    whatChanged.push(
      `${names(screen)} landed well, so Qloo was asked for more like that: ${names(learnedScreen)}.`,
    );
  }
  if (musicRanked.length) {
    whatChanged.push(
      `Qloo ranked the music still to play against what landed well; ${names(musicRanked.slice(0, 2))} ${musicRanked.length === 1 ? "leads" : "lead"}.`,
    );
  }
  if (screenRanked.length) {
    whatChanged.push(
      `Qloo ranked the ${screenTarget === "movie" ? "films" : "TV shows"} still to play the same way; ${names(screenRanked.slice(0, 2))} ${screenRanked.length === 1 ? "leads" : "lead"}.`,
    );
  }
  const lovedNotExtended = loved.filter(
    (r) =>
      !(learnedMusic.length && music.includes(r)) && !(learnedScreen.length && screen.includes(r)),
  );
  if (lovedNotExtended.length) {
    whatChanged.push(
      `${names(lovedNotExtended)} landed well, so ${lovedNotExtended.length === 1 ? "it comes" : "they come"} up sooner.`,
    );
  }
  const failed = [musicOutcome, screenOutcome].some((o) => o.kind === "failed");
  if (failed && learnedItems.length === 0 && (music.length || screen.length)) {
    whatChanged.push(
      "Qloo couldn't be asked for more just now, so this session comes from the profile.",
    );
  }
  if (upset.length) {
    whatChanged.push(
      `${names(upset)} won't come back: ${upset.length === 1 ? "that one" : "those"} seemed to upset them, so ${upset.length === 1 ? "it's" : "they're"} now on the things to avoid.`,
    );
  }
  if (quiet.length) {
    whatChanged.push(
      `${names(quiet)} got a quieter response, so ${quiet.length === 1 ? "it moves" : "they move"} back.`,
    );
  }
  if (favouriteDomain) {
    whatChanged.push(
      `"Your choice" this time is ${DOMAIN_WORDS[favouriteDomain]}, which landed best.`,
    );
  }

  return {
    weights,
    favouriteDomain,
    learnedItems,
    rankEvidence,
    learnedAvoid,
    whatChanged: whatChanged.slice(0, 6),
  };
}

/** Qloo's order for the options it ranked (best first), with the call's evidence; null if unusable. */
function rankOrder(
  res: GatewayResult | "refused" | null,
  options: readonly TasteItem[],
): { items: TasteItem[]; evidenceId: string } | null {
  if (!res || res === "refused" || res.kind !== "usable") return null;
  const byId = new Map(options.map((o) => [o.entityId.toLowerCase(), o]));
  const results = (res.envelope as { results?: unknown }).results;
  const items = (Array.isArray(results) ? results : [])
    .map((r) => {
      const id = (r as { entity_id?: unknown }).entity_id;
      return typeof id === "string" ? byId.get(id.toLowerCase()) : undefined;
    })
    .filter((i): i is TasteItem => !!i)
    .filter((i, n, all) => all.indexOf(i) === n);
  return items.length ? { items, evidenceId: res.evidenceId } : null;
}

function learnedItem(f: Found, domain: TasteDomain, from: string[]): TasteItem {
  const because = f.becauseOf.length ? f.becauseOf : from.slice(0, 2);
  return {
    entityId: f.entityId,
    domain,
    entityType: f.entityType,
    typeLabel: typeLabel(f.entityType),
    name: f.name,
    year: f.year,
    description: f.description,
    caption: `People who enjoy ${join(because)} often also enjoy ${f.name}.`,
    source: "learned",
    becauseOf: because,
    evidenceIds: [f.evidenceId],
  };
}
