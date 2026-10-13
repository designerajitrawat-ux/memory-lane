import {
  Clapperboard,
  Frown,
  MapPin,
  Meh,
  Mic2,
  Music,
  Smile,
  Tv,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { Reaction, SessionItem, SessionItemKind } from "@memory-lane/shared";

export const KIND_ICONS: Record<SessionItemKind, LucideIcon> = {
  song: Music,
  film: Clapperboard,
  tv: Tv,
  food: UtensilsCrossed,
  place: MapPin,
};

const KIND_LABELS: Record<SessionItemKind, string> = {
  song: "A song",
  film: "A film to talk about",
  tv: "A TV show to talk about",
  food: "Food and the senses",
  place: "A place to visit in words",
};

/** Where an item sits in the session template (docs/05 §2). */
export function slotLabel(item: SessionItem, index: number, total: number): string {
  if (index === 0 && item.kind === "song") return "Opening song";
  if (index === total - 1 && item.kind === "song") return "Closing song";
  if (index === 4) return "Your choice";
  return KIND_LABELS[item.kind];
}

export const REACTIONS: { value: Reaction; label: string; icon: LucideIcon }[] = [
  { value: "sang", label: "Sang along", icon: Mic2 },
  { value: "engaged", label: "Engaged", icon: Smile },
  { value: "neutral", label: "Neutral", icon: Meh },
  { value: "distressed", label: "Seemed upset", icon: Frown },
];

export const REACTION_LABEL: Record<Reaction, string> = Object.fromEntries(
  REACTIONS.map((r) => [r.value, r.label]),
) as Record<Reaction, string>;
