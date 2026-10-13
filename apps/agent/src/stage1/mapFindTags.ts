import type { Domain, QlooEnvelope } from "@memory-lane/shared";
import { tagCategory } from "./labels";
import { MAX_CANDIDATES, normalise, str, type MappedCandidate } from "./mapDescribe";

// Which tag to keep when Qloo returns the same concept under several tag types (the kit's "jazz"
// example: five Jazz tags). Dishes prefer the cuisine tag; anything else keeps Qloo's order.
const PREFERRED: Partial<Record<Domain, string[]>> = {
  food: ["cuisine", "popular_food_item", "specialty_dish"],
};

/**
 * Turns a `qloo_find_tags` envelope into one candidate per distinct concept name, in Qloo's order.
 * Used for food and "something else" favourites, which are tags in Qloo rather than entities.
 */
export function mapFindTags(envelope: QlooEnvelope, domain: Domain, query = ""): MappedCandidate[] {
  const order = PREFERRED[domain] ?? [];
  const rank = (type: string | null) => {
    const i = order.indexOf(tagCategory(type) ?? "");
    return i === -1 ? order.length : i;
  };
  const byName = new Map<string, MappedCandidate>();
  for (const raw of Array.isArray(envelope.results) ? envelope.results : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const name = str(r.name);
    const type = str(r.type) ?? null;
    if (!id || !name || !id.startsWith("urn:tag:")) continue;
    // Food: only food tags (a dish, not a genre or keyword that happens to share the words).
    if (order.length && !order.includes(tagCategory(type) ?? "")) continue;
    const key = normalise(name);
    const seen = byName.get(key);
    if (!seen) {
      if (byName.size >= MAX_CANDIDATES) continue;
      byName.set(key, { entityId: id, name, entityType: type, year: null, description: null });
    } else if (rank(type) < rank(seen.entityType)) {
      byName.set(key, { ...seen, entityId: id, entityType: type });
    }
  }
  const found = [...byName.values()];
  // With an exact name match, keep only tags that share a real word with what was typed ("Sarson Ka
  // Saag" and "Saag" for "Sarson da saag", not "Saj" or "Savaji").
  const words = significantWords(query);
  if (!found.some((c) => normalise(c.name) === normalise(query)) || words.size === 0) return found;
  return found.filter((c) => [...significantWords(c.name)].some((w) => words.has(w)));
}

const FILLER = new Set([
  "and",
  "the",
  "with",
  "da",
  "di",
  "de",
  "ka",
  "ki",
  "ke",
  "of",
  "la",
  "le",
]);

function significantWords(s: string): Set<string> {
  return new Set(
    s
      .split(/[^\p{L}\p{N}]+/u)
      .map(normalise)
      .filter((w) => w.length >= 3 && !FILLER.has(w)),
  );
}
