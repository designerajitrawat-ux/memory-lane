/**
 * Personal-data patterns shared by the profile form (web + agent validation) and the Qloo PII guard
 * (apps/agent/src/qloo/redact.ts), so both apply exactly the same rules (docs/07 §1–2).
 * Always test `normalizeText(value)`, never the raw string.
 */

// Common Cyrillic/Greek letters that look Latin, so "Bimlа" (Cyrillic а) can't dodge a check.
const CONFUSABLES: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  і: "i",
  ј: "j",
  ѕ: "s",
  ԁ: "d",
  ӏ: "l",
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  α: "a",
  ο: "o",
  ρ: "p",
  ν: "v",
  ι: "i",
  Α: "A",
  Β: "B",
  Ε: "E",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Χ: "X",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLES).join("")}]`, "gu");

/**
 * NFKC (fullwidth → ASCII, composed accents), drop invisible format chars, fold lookalikes, turn
 * digits of any script into 0-9, collapse spaces.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\p{Cf}­]/gu, "")
    .replace(CONFUSABLE_RE, (c) => CONFUSABLES[c] ?? c)
    .replace(/\p{Nd}/gu, asciiDigit)
    .replace(/[\s\p{Z}]+/gu, " ")
    .trim();
}

// Unicode decimal digits come in contiguous runs of ten (0-9), so a digit's value is its offset
// from the start of its run, mod 10.
function asciiDigit(c: string): string {
  let cp = c.codePointAt(0) ?? 48;
  let offset = 0;
  while (/\p{Nd}/u.test(String.fromCodePoint(cp - 1))) {
    cp--;
    offset++;
  }
  return String(offset % 10);
}

export const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
// 9+ digits with short non-letter separators; year ranges like "1939-1945" (8 digits) pass.
export const PHONE = /(?:\+?\p{Nd}[^\p{L}\p{Nd}]{0,3}){9,}/u;
export const URL_LIKE = /\bhttps?:\/\/|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|net|org|in|io|co)\b/iu;
// Unit/house numbers anywhere ("House No. 7", "H.No. 12", "Flat 4B").
export const UNIT_NUMBER =
  /\b(?:(?:flat|house|plot|apartment|apt)\s*(?:no\.?|number|#)?|h\.?\s*no\.?)\s*\p{Nd}+/iu;
// Only for free text and places (titles like "21 Jump Street" are real entities):
// PIN/ZIP codes and "<number> <words> <street word>".
export const POSTCODE = /(?<!\p{Nd})(?:\p{Nd}{6}|\p{Nd}{5}(?:-\p{Nd}{4})?)(?!\p{Nd})/u;
export const STREET =
  /\b\p{Nd}{1,5}[a-z]?,?\s+(?:[\p{L}.'-]+\s+){0,3}(?:road|rd|street|st|lane|ln|marg|nagar|colony|sector|block|gali|avenue|ave)\b/iu;
export const DIGIT = /\p{Nd}/u;
// Health and care context: never stored in profiles, never sent to Qloo. Stem-tolerant, but kept
// away from titles like "Memory" or "General Hospital".
export const HEALTH =
  /\b(?:dement(?:ia|ias|ed)|alzheimer\w*|parkinson\w*|amnesi\w*|diagnos\w*|medications?|medicines?|meds|prescriptions?|therap(?:y|ies|ist|ists)|hospice|patients?|caregiv\w*|carers?|lewy|mci|stroke|memory\s+(?:loss|care)|(?:nursing|care)\s+homes?|cognitive\s+(?:decline|impairment))\b/iu;
