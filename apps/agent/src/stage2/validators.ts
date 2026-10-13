import type { TasteItem } from "@memory-lane/shared";
import { captionAllowed } from "./language";
import type { EvidenceRow } from "./store";

const USABLE = new Set(["ok", "partial", "degraded"]);

export type DropReason = "no_evidence" | "avoid" | "language";

/**
 * The last gate before anything is shown (docs/05 §3), run on every item whoever produced it:
 * 1. Grounding: a Qloo-found item must appear in the results of one of its own evidence records
 *    (a usable call made for this profile). A favourite must point at the Stage 1 call its confirmed
 *    match came from.
 * 2. Avoid-list: name and Qloo description are checked (CLAUDE.md rule 9).
 * 3. Language policy on the caption.
 */
export function validateTasteItems(
  items: readonly TasteItem[],
  evidence: readonly EvidenceRow[],
  isAvoided: (...fields: (string | null)[]) => boolean,
): { kept: TasteItem[]; dropped: { item: TasteItem; reason: DropReason }[] } {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const grounded = (item: TasteItem) =>
    item.evidenceIds.some((id) => {
      const e = byId.get(id);
      if (!e) return false;
      if (item.source === "favourite") return e.status !== "error";
      return USABLE.has(e.status) && e.digest.some((d) => d.id === item.entityId);
    });

  const kept: TasteItem[] = [];
  const dropped: { item: TasteItem; reason: DropReason }[] = [];
  for (const item of items) {
    const reason: DropReason | null = !grounded(item)
      ? "no_evidence"
      : isAvoided(item.name, item.description)
        ? "avoid"
        : !captionAllowed(item.caption)
          ? "language"
          : null;
    if (reason) dropped.push({ item, reason });
    else kept.push(item);
  }
  return { kept, dropped };
}
