/**
 * The avoid-list is absolute (CLAUDE.md rule 9). An item is avoided when its name or Qloo description
 * contains an avoid phrase, or one of its meaningful words ("Vietnam War" → "vietnam", "1984"). Qloo
 * descriptions are read too: Phase 0 found films touching war and trauma themes that titles hide.
 *
 * Well-known painful topics also bring their related words: an avoid-list saying "Partition" must keep
 * out a border-crossing landmark whose description talks about the frontier and never says "Partition"
 * (live check, 2026-10-13).
 */
const FILLER = new Set([
  "about",
  "after",
  "before",
  "being",
  "every",
  "films",
  "memories",
  "memory",
  "movie",
  "movies",
  "music",
  "people",
  "songs",
  "their",
  "there",
  "these",
  "things",
  "those",
  "times",
  "where",
  "which",
  "years",
]);

/** Topic word → phrases that point at the same pain. Matched as whole words after normalising. */
const RELATED: Record<string, string[]> = {
  partition: [
    "partition",
    "1947",
    "refugee",
    "refugees",
    "india pakistan border",
    "wagah",
    "attari",
    "border crossing",
  ],
  "1984": ["1984", "operation blue star", "anti sikh", "riots"],
  vietnam: ["vietnam", "viet nam", "napalm", "anti war", "draft dodger"],
  blitz: [
    "blitz",
    "air raid",
    "air raids",
    "bombing",
    "bombings",
    "luftwaffe",
    "evacuee",
    "evacuees",
  ],
  bombing: ["bombing", "bombings", "air raid", "air raids", "blitz"],
  holocaust: ["holocaust", "concentration camp", "auschwitz", "nazi"],
  "9 11": ["9 11", "september 11", "twin towers", "world trade center"],
};

const text = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const words = (s: string) => text(s).split(" ").filter(Boolean);

export function avoidMatcher(avoid: readonly string[]) {
  const normalised = avoid.map(text).filter(Boolean);
  // Two letters is enough ("U2", "Om"): matching is whole-word, so short entries stay precise (review W3a).
  const phrases = new Set(normalised.filter((p) => p.length >= 2));
  for (const entry of normalised) {
    for (const [topic, related] of Object.entries(RELATED)) {
      if (` ${entry} `.includes(` ${topic} `)) for (const r of related) phrases.add(r);
    }
  }
  // Beyond the exact phrase: a one-word entry ("Partition", "1984") matches on that word; a longer one
  // needs all its meaningful words ("Unchained Melody" mustn't block every song described as a melody).
  const wordSets = avoid
    .map((entry) =>
      words(entry).filter((w) => (w.length >= 3 && !FILLER.has(w)) || /^\d{4}$/.test(w)),
    )
    .filter((ws) => ws.length > 0);
  return (...fields: (string | null | undefined)[]): boolean => {
    const hay = text(fields.filter(Boolean).join(" "));
    if (!hay) return false;
    const padded = ` ${hay} `;
    for (const p of phrases) if (padded.includes(` ${p} `)) return true;
    const present = new Set(hay.split(" "));
    return wordSets.some((ws) => ws.every((w) => present.has(w)));
  };
}
