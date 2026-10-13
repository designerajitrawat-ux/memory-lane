/**
 * Plain-language labels for Qloo types, shown to caregivers next to a candidate. The raw type URN is
 * what gets stored (Stage 2 needs to know entity vs tag); this is display only.
 */
const ENTITY_LABELS: Record<string, string> = {
  artist: "singer or band",
  movie: "film",
  tv_show: "TV show",
  place: "place",
  locality: "town or city",
  destination: "destination",
  person: "person",
  actor: "actor",
  director: "director",
  album: "album",
  book: "book",
  author: "author",
  podcast: "podcast",
  brand: "brand",
  videogame: "video game",
};

const TAG_LABELS: Record<string, string> = {
  cuisine: "dish",
  popular_food_item: "dish",
  specialty_dish: "dish",
  genre: "genre",
  subgenre: "genre",
  keyword: "theme",
};

/** "urn:entity:tv_show" → "TV show", "urn:tag:cuisine:qloo" → "dish". */
export function typeLabel(urn: string | null): string | null {
  if (!urn) return null;
  const parts = urn.split(":");
  if (parts[0] !== "urn") return urn.replace(/_/g, " ");
  if (parts[1] === "entity") {
    const kind = parts[2] ?? "";
    return ENTITY_LABELS[kind] ?? kind.replace(/_/g, " ");
  }
  if (parts[1] === "tag") {
    const category = parts[2] ?? "";
    return TAG_LABELS[category] ?? category.replace(/_/g, " ");
  }
  return null;
}

/** The tag category of a tag URN ("urn:tag:cuisine:qloo" → "cuisine"), else null. */
export function tagCategory(urn: string | null): string | null {
  const parts = urn?.split(":") ?? [];
  return parts[0] === "urn" && parts[1] === "tag" ? (parts[2] ?? null) : null;
}
