import type { TasteItem } from "@memory-lane/shared";
import { captionAllowed, promptAllowed } from "../stage2/language";
import type { ComposedItem } from "./compose";
import { linkAllowed } from "./links";
import { promptsFor } from "./prompts";

export type SessionDropReason = "not_in_profile" | "avoid" | "language" | "link";

/**
 * Validators for session items (docs/05 §3), run on every item whoever composed it (code now, the
 * LLM later): it must be an item of this taste profile carrying that item's evidence (the LLM may
 * not introduce entities), pass the avoid-list and the language policy, and link only to allowed
 * search pages. Prompts that read like memory tests are replaced with gentle ones.
 */
export function validateSessionItems(
  items: readonly ComposedItem[],
  profileItems: readonly TasteItem[],
  isAvoided: (...fields: (string | null)[]) => boolean,
  sessionNumber: number,
): { kept: ComposedItem[]; dropped: { item: ComposedItem; reason: SessionDropReason }[] } {
  const byId = new Map(profileItems.map((i) => [i.entityId, i]));
  const kept: ComposedItem[] = [];
  const dropped: { item: ComposedItem; reason: SessionDropReason }[] = [];
  for (const item of items) {
    const source = byId.get(item.entityId);
    const grounded =
      !!source &&
      item.evidenceIds.length > 0 &&
      item.evidenceIds.every((id) => source.evidenceIds.includes(id));
    const reason: SessionDropReason | null = !grounded
      ? "not_in_profile"
      : isAvoided(item.name, item.description, source.description)
        ? "avoid"
        : !captionAllowed(item.why)
          ? "language"
          : !linkAllowed(item.link) || !linkAllowed(item.altLink)
            ? "link"
            : null;
    if (reason) {
      dropped.push({ item, reason });
      continue;
    }
    const prompts = item.prompts.filter(promptAllowed);
    kept.push({
      ...item,
      position: kept.length,
      prompts: prompts.length ? prompts : promptsFor(item.kind, item.name, sessionNumber),
    });
  }
  return { kept, dropped };
}
