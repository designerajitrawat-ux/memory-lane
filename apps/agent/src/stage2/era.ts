/**
 * The person's era (docs/05 Phase 0 findings): Qloo has no year filter, so code keeps films and TV to
 * the years they were young and busy, and prefers singers Qloo describes as active then. The
 * "reminiscence bump" (memories from roughly ages 10–30 are the most vivid) ranks first.
 */
export interface Era {
  from: number;
  to: number;
  bumpFrom: number;
  bumpTo: number;
}

export function eraFor(birthYear: number, now = new Date().getUTCFullYear()): Era {
  return {
    from: birthYear + 5,
    to: Math.min(birthYear + 45, now),
    bumpFrom: birthYear + 10,
    bumpTo: birthYear + 30,
  };
}

export const yearFits = (year: number | null, era: Era): year is number =>
  year !== null && year >= era.from && year <= era.to;

/** 0 inside the bump, else years away from it (smaller = better). */
export const bumpDistance = (year: number, era: Era) =>
  year < era.bumpFrom ? era.bumpFrom - year : year > era.bumpTo ? year - era.bumpTo : 0;

// "1950s", "1950s–60s" (en dash or hyphen), and plain years like "1929".
const DECADES = /\b(1[89]\d0|20[0-2]0)s\b(?:\s*[–-]\s*'?(\d)0s\b)?/g;
const YEARS = /\b(1[89]\d\d|20[0-2]\d)\b(?!s)/g;

/** Years and decades a description mentions; a decade is its first year, flagged. */
function scan(text: string | null): { year: number; decade: boolean }[] {
  if (!text) return [];
  const out: { year: number; decade: boolean }[] = [];
  for (const m of text.matchAll(DECADES)) {
    const first = Number(m[1]);
    out.push({ year: first, decade: true });
    if (m[2] !== undefined) {
      out.push({ year: Math.floor(first / 100) * 100 + Number(m[2]) * 10, decade: true });
    }
  }
  for (const m of text.matchAll(YEARS)) out.push({ year: Number(m[1]), decade: false });
  return out;
}

/** "1929–1987", "1950s–60s", "the late 1980s" → [1929, 1987], [1950, 1960], [1980]. */
export const mentionedYears = (text: string | null) => scan(text).map((m) => m.year);

/** The era from a stored profile's years (from = birth + 5, as in `eraFor`). */
export const eraOfRange = (range: { from: number; to: number }): Era => ({
  from: range.from,
  to: range.to,
  bumpFrom: range.from + 5,
  bumpTo: range.from + 25,
});

/**
 * The decade to search a singer's songs by ("1960s"): a decade their Qloo description mentions inside
 * the person's era, the one closest to the middle of the reminiscence bump; else the bump's own decade.
 */
export function searchDecade(text: string | null, era: Era): string {
  const middle = (era.bumpFrom + era.bumpTo) / 2;
  const decades = scan(text)
    .filter((m) => m.decade && m.year + 9 >= era.from && m.year <= era.to)
    .map((m) => m.year);
  const pick = decades.length
    ? decades.reduce((best, y) =>
        Math.abs(y + 5 - middle) < Math.abs(best + 5 - middle) ? y : best,
      )
    : Math.floor(middle / 10) * 10;
  return `${pick}s`;
}

/** Where a description places someone in time, relative to the person's era. */
export type EraPlacement = "fits" | "unknown" | "later";

/**
 * Places a singer by the years their Qloo description mentions: the average of those years (a decade
 * counts as its middle) against the reminiscence bump. Mostly-later voices go last; no dates = unknown,
 * left in Qloo's order (Qloo doesn't give artists a year — Phase 0).
 */
export function eraPlacement(text: string | null, era: Era): EraPlacement {
  const mentions = scan(text).map((m) => (m.decade ? m.year + 5 : m.year));
  if (mentions.length === 0) return "unknown";
  const centre = mentions.reduce((a, b) => a + b, 0) / mentions.length;
  // A voice centred five or more years after the bump is mostly later (live check: "since the
  // 1980s" was let in at exactly the boundary for a 1950-born persona).
  return centre >= era.bumpTo + 5 ? "later" : "fits";
}
