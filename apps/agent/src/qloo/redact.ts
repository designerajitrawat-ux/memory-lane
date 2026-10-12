import { FREE_TEXT_FIELDS, LOCATION_FIELDS } from "./tools";

/**
 * PII guard in front of Qloo (docs/07 §2.1, docs/05 §3.5). Only public cultural signals may reach Qloo:
 * entity names, tags, coarse regions, target types. A rejection names the reason and field, never the
 * value, so it is safe to log. Errs on the side of refusing: a refused call can be rephrased, a leak
 * can't be undone.
 */
export type RedactReason = "nickname" | "email" | "phone" | "url" | "address" | "health";

export type RedactResult = { ok: true } | { ok: false; reason: RedactReason; field: string };

export interface RedactContext {
  /** The person's nickname from the profile (null when there is none); never sent to Qloo. */
  nickname: string | null;
}

// Common Cyrillic/Greek letters that look Latin, so "Bimlа" (Cyrillic а) can't dodge the check.
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

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/u;
// 9+ digits (any script) with short non-letter separators; year ranges like "1960-1975" (8) pass.
const PHONE = /(?:\+?\p{Nd}[^\p{L}\p{Nd}]{0,3}){9,}/u;
const URL_LIKE = /\bhttps?:\/\/|\bwww\.\S+|\b[a-z0-9-]+\.(?:com|net|org|in|io|co)\b/iu;
// Unit/house numbers anywhere ("House No. 7", "H.No. 12", "Flat 4B").
const UNIT_NUMBER =
  /\b(?:(?:flat|house|plot|apartment|apt)\s*(?:no\.?|number|#)?|h\.?\s*no\.?)\s*\p{Nd}+/iu;
// In free text and location fields only (titles like "21 Jump Street" are real entities):
// PIN/ZIP codes and "<number> <words> <street word>".
const POSTCODE = /(?<!\p{Nd})(?:\p{Nd}{6}|\p{Nd}{5}(?:-\p{Nd}{4})?)(?!\p{Nd})/u;
const STREET =
  /\b\p{Nd}{1,5}[a-z]?,?\s+(?:[\p{L}.'-]+\s+){0,3}(?:road|rd|street|st|lane|ln|marg|nagar|colony|sector|block|gali|avenue|ave)\b/iu;
const DIGIT = /\p{Nd}/u;
// Health and care context must never reach Qloo. Stem-tolerant, but kept away from titles like
// "Memory" or "General Hospital".
const HEALTH =
  /\b(?:dement(?:ia|ias|ed)|alzheimer\w*|parkinson\w*|amnesi\w*|diagnos\w*|medications?|medicines?|meds|prescriptions?|therap(?:y|ies|ist|ists)|hospice|patients?|caregiv\w*|carers?|lewy|mci|memory\s+(?:loss|care)|(?:nursing|care)\s+homes?|cognitive\s+(?:decline|impairment))\b/iu;

export function checkArgs(args: unknown, ctx: RedactContext): RedactResult {
  const nicknameRes = nicknamePatterns(ctx.nickname);

  for (const [field, raw] of strings(args)) {
    const value = normalizeText(raw);
    const key = leaf(field);
    if (nicknameRes.some((re) => re.test(value))) return reject("nickname", field);
    if (EMAIL.test(value)) return reject("email", field);
    if (URL_LIKE.test(value)) return reject("url", field);
    if (PHONE.test(value)) return reject("phone", field);
    if (UNIT_NUMBER.test(value)) return reject("address", field);
    if (LOCATION_FIELDS.has(key) && DIGIT.test(value)) return reject("address", field);
    if (FREE_TEXT_FIELDS.has(key) && (POSTCODE.test(value) || STREET.test(value))) {
      return reject("address", field);
    }
    if (HEALTH.test(value)) return reject("health", field);
  }
  return { ok: true };
}

/**
 * The whole nickname with any separators between its parts, plus each part of 3+ letters on its own.
 * Parts of 4+ letters also match as a word prefix ("Bimlaji", "Bimla's"), 3-letter parts as whole words.
 */
function nicknamePatterns(nickname: string | null): RegExp[] {
  const tokens = normalizeText(nickname ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (tokens.length === 0 || tokens.join("").length < 2) return [];
  const before = "(?:^|[^\\p{L}\\p{N}])";
  const after = "(?:$|[^\\p{L}\\p{N}])";
  const patterns = [
    new RegExp(`${before}${tokens.map(escape).join("[^\\p{L}\\p{N}]+")}${after}`, "iu"),
  ];
  for (const t of tokens) {
    if (t.length >= 4) patterns.push(new RegExp(`${before}${escape(t)}`, "iu"));
    else if (t.length === 3) patterns.push(new RegExp(`${before}${escape(t)}${after}`, "iu"));
  }
  return patterns;
}

function reject(reason: RedactReason, field: string): RedactResult {
  return { ok: false, reason, field };
}

/** Yields [path, value] for every string inside args (objects and arrays, any depth). */
function* strings(value: unknown, path = ""): Generator<[string, string]> {
  if (typeof value === "string") {
    yield [path || "(root)", value];
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* strings(v, `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) yield* strings(v, path ? `${path}.${k}` : k);
  }
}

const leaf = (path: string) =>
  path
    .replace(/\[\d+\]$/, "")
    .split(".")
    .pop() ?? path;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
