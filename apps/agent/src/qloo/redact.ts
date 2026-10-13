import {
  DIGIT,
  EMAIL,
  HEALTH,
  normalizeText,
  PHONE,
  POSTCODE,
  STREET,
  UNIT_NUMBER,
  URL_LIKE,
} from "@memory-lane/shared";
import { FREE_TEXT_FIELDS, LOCATION_FIELDS } from "./tools";

// A Qloo entity UUID (its digits would otherwise look like a phone number). Exempt only in `signals`,
// only exactly as sent, and only when the server vouches for it: Stage 2 passes the entity ids of the
// confirmed seeds it read from the database, never anything from a request (security review W1).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Re-exported for existing imports; the rules live in packages/shared/src/pii.ts.
export { normalizeText };

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
  /** Lower-cased Qloo entity ids the server read from confirmed seeds; exempt in `signals` only. */
  trustedIds?: ReadonlySet<string>;
}

export function checkArgs(args: unknown, ctx: RedactContext): RedactResult {
  const nicknameRes = nicknamePatterns(ctx.nickname);

  for (const [field, raw] of strings(args)) {
    const value = normalizeText(raw);
    const key = leaf(field);
    if (
      key === "signals" &&
      raw === value &&
      UUID.test(raw) &&
      ctx.trustedIds?.has(raw.toLowerCase())
    ) {
      continue;
    }
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
