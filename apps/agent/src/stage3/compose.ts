import type { SessionItemKind, TasteDomain, TasteItem, TasteProfile } from "@memory-lane/shared";
import { linksFor, type Link } from "./links";
import { promptsFor } from "./prompts";

/** A planned item before it is stored (no id, no reaction yet). */
export interface ComposedItem {
  position: number;
  kind: SessionItemKind;
  domain: TasteDomain;
  entityId: string;
  entityType: string | null;
  name: string;
  year: number | null;
  /** Qloo's one line, kept for the avoid check (not stored on the item). */
  description: string | null;
  why: string;
  prompts: string[];
  minutes: number;
  link: Link;
  altLink: Link | null;
  evidenceIds: string[];
}

export interface ComposeInput {
  profile: TasteProfile;
  sessionNumber: number;
  /** Entities used in the last session: rotated out when there is something else. */
  recent?: ReadonlySet<string>;
  /** Stage 4: learned weights per entity (reactions); higher comes first, ≤ -1 never returns. */
  weights?: ReadonlyMap<string, number>;
  /** Stage 4: the domain that landed best last time, for the "your choice" slot. */
  favouriteDomain?: TasteDomain | null;
}

const MINUTES: Record<SessionItemKind, number> = { song: 4, film: 5, tv: 4, food: 5, place: 5 };
const FAVOURITE_WHY = "You added this favourite; Qloo confirmed the match.";

/**
 * Stage 3 (docs/05 §2): the session template (20–30 min) — an opening song, a film or TV memory,
 * food and the senses, a place, "your choice", and a closing song — filled only from the Life Taste
 * Profile, so every item already carries Qloo evidence. A slot whose domain is empty becomes another
 * song (music is the spine, Phase 0).
 */
export function composeSession(input: ComposeInput): ComposedItem[] {
  const { profile, sessionNumber } = input;
  const recent = input.recent ?? new Set<string>();
  const weights = input.weights ?? new Map<string, number>();
  const used = new Set<string>();

  const pool = (domain: TasteDomain) =>
    profile.items
      .filter((i) => i.domain === domain && !used.has(i.entityId))
      .filter((i) => (weights.get(i.entityId) ?? 0) > -1) // a "distressed" item never returns
      .map((item, order) => ({ item, order }))
      .sort(
        (a, b) =>
          Number(recent.has(a.item.entityId)) - Number(recent.has(b.item.entityId)) ||
          (weights.get(b.item.entityId) ?? 0) - (weights.get(a.item.entityId) ?? 0) ||
          Number(b.item.source === "favourite") - Number(a.item.source === "favourite") ||
          a.order - b.order,
      )
      .map((x) => x.item);

  const take = (domain: TasteDomain): TasteItem | null => {
    const next = pool(domain)[0] ?? null;
    if (next) used.add(next.entityId);
    return next;
  };

  const counts = (d: TasteDomain) => pool(d).length;
  const choiceDomain =
    input.favouriteDomain && counts(input.favouriteDomain) > 0
      ? input.favouriteDomain
      : (["music", "film_tv", "places", "food"] as const).reduce((best, d) =>
          counts(d) > counts(best) ? d : best,
        );

  const slots: TasteDomain[] = ["music", "film_tv", "food", "places", choiceDomain, "music"];
  const picked: TasteItem[] = [];
  for (const domain of slots) {
    const item = take(domain) ?? take("music");
    if (item) picked.push(item);
  }

  return picked.map((item, position) => {
    const kind = kindOf(item);
    const { link, altLink } = linksFor(kind, item.name, item.year);
    return {
      position,
      kind,
      domain: item.domain,
      entityId: item.entityId,
      entityType: item.entityType,
      name: item.name,
      year: item.year,
      description: item.description,
      why: item.source === "favourite" ? FAVOURITE_WHY : item.caption,
      prompts: promptsFor(kind, item.name, sessionNumber + position),
      minutes: position === picked.length - 1 && kind === "song" ? 3 : MINUTES[kind],
      link,
      altLink,
      evidenceIds: item.evidenceIds,
    };
  });
}

export function kindOf(item: Pick<TasteItem, "domain" | "entityType">): SessionItemKind {
  const t = item.entityType ?? "";
  if (t.endsWith(":movie")) return "film";
  if (t.endsWith(":tv_show")) return "tv";
  if (item.domain === "food" || t.startsWith("urn:tag:")) return "food";
  if (item.domain === "places") return "place";
  return "song";
}
