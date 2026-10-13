import type { Domain, QlooEnvelope } from "@memory-lane/shared";

export interface MappedCandidate {
  entityId: string;
  name: string;
  /** Raw Qloo type URN ("urn:entity:artist", "urn:tag:cuisine:qloo"); labels come from labels.ts. */
  entityType: string | null;
  year: number | null;
  /** One line from Qloo that helps tell same-name matches apart (shown, never sent anywhere). */
  description: string | null;
}

export const MAX_CANDIDATES = 5;
const MAX_DESCRIPTION = 160;

type Rec = Record<string, unknown>;

const PLACE_TYPES = new Set(["urn:entity:place", "urn:entity:locality", "urn:entity:destination"]);

/**
 * Turns a `qloo_describe` envelope into the matches a caregiver chooses from (shape pinned against
 * local recordings, 2026-10-13). Qloo returns one selected entity plus "alternatives". For an exact
 * match the alternatives are mostly fuzzy noise (WALL·E for "Mughal-e-Azam"), so only alternatives with
 * the same name and type are offered (a remake, a namesake). For a non-exact match, and for places
 * (whose names mislead: "Golden Temple" matched exactly to a temple in another city — Phase 0), all
 * alternatives of the same type are offered. When Qloo can't pick (status needs_input) the choices are
 * in `resolution.issues[0].candidates`; listings of the same place (same name and address — Qloo had
 * five for one shrine) are offered once. Envelopes without a resolution block fall back to `results`.
 */
export function mapDescribe(envelope: QlooEnvelope): MappedCandidate[] {
  const issue = list(obj(envelope.resolution)?.issues)[0];
  if (issue) return fromIssue(issue);
  const outcome = firstOutcome(envelope.resolution);
  const interpreted = obj(obj(envelope.interpretation)?.entity);
  const results = list(envelope.results);

  const selectedRaw = obj(outcome?.selected);
  const selected = selectedRaw
    ? fromResolution(selectedRaw)
    : interpreted
      ? candidate(interpreted.entityId, interpreted.name, interpreted.type, null, null)
      : null;
  if (!selected) return fromResults(results);

  // The selected entity's full record (year, description) is in `results`.
  const detail = results.find((r) => str(r.entity_id ?? r.id) === selected.entityId);
  if (detail) {
    const props = obj(detail.properties) ?? {};
    selected.year = yearOf(props.release_year ?? props.year ?? props.release_date) ?? selected.year;
    selected.description ??=
      short(str(props.short_description ?? props.description)) ?? addressLine(props.address);
  }

  const isPlace = PLACE_TYPES.has(selected.entityType ?? "");
  const exact = !isPlace && str(outcome?.match ?? interpreted?.match) === "exact";
  const out = [selected];
  for (const raw of list(outcome?.alternatives)) {
    const alt = fromResolution(raw);
    if (!alt || out.some((c) => c.entityId === alt.entityId)) continue;
    if (alt.entityType !== selected.entityType) continue;
    if (exact && normalise(alt.name) !== normalise(selected.name)) continue;
    out.push(alt);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** The Qloo entity type to ask for, per wizard domain. Food and "other" go through find_tags. */
export function describeTypeFor(domain: Domain): string | undefined {
  switch (domain) {
    case "music":
      return "artist";
    case "film":
      return "movie";
    case "tv":
      return "tv_show";
    case "place":
      return "place";
    default:
      return undefined;
  }
}

function fromIssue(issue: Rec): MappedCandidate[] {
  const out: MappedCandidate[] = [];
  const seen = new Set<string>();
  for (const raw of list(issue.candidates)) {
    const c = fromResolution(raw);
    if (!c) continue;
    const address = str(raw.address);
    const key = address ? `${normalise(c.name)}|${normalise(address)}` : c.entityId;
    if (seen.has(key)) continue;
    seen.add(key);
    if (address) c.description = withPlace(c.description, addressLine(address));
    out.push(c);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** "Iconic shrine…" + "Amritsar, India" → "Iconic shrine… (Amritsar, India)", kept short. */
function withPlace(description: string | null, where: string | null): string | null {
  if (!where) return description;
  if (!description) return where;
  const room = Math.max(40, MAX_DESCRIPTION - where.length - 3);
  const text = description.length > room ? `${description.slice(0, room).trimEnd()}…` : description;
  return `${text} (${where})`;
}

function fromResolution(r: Rec | undefined): MappedCandidate | null {
  if (!r) return null;
  const description = short(str(r.description));
  return candidate(r.id ?? r.entity_id, r.name, r.type, yearInText(description), description);
}

function fromResults(results: Rec[]): MappedCandidate[] {
  const out: MappedCandidate[] = [];
  for (const r of results) {
    const props = obj(r.properties) ?? {};
    const c = candidate(
      r.entity_id ?? r.id,
      r.name ?? r.title,
      r.type ?? r.subtype,
      yearOf(props.release_year ?? r.release_year ?? props.release_date ?? r.release_date),
      short(str(props.short_description ?? props.description)),
    );
    if (c) out.push(c);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

function candidate(
  id: unknown,
  name: unknown,
  type: unknown,
  year: number | null,
  description: string | null,
): MappedCandidate | null {
  const entityId = str(id);
  const n = str(name);
  if (!entityId || !n) return null;
  return { entityId, name: n, entityType: str(type) ?? null, year, description };
}

function firstOutcome(resolution: unknown): Rec | undefined {
  return list(obj(resolution)?.outcomes)[0];
}

const obj = (v: unknown): Rec | undefined =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : undefined;

const list = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter((x): x is Rec => !!obj(x)) : []);

export const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;

/** Case, accents and punctuation don't make a different name ("Mughal-E-Azam" = "mughal e azam"). */
export const normalise = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

export function short(s: string | undefined): string | null {
  if (!s) return null;
  if (s.length <= MAX_DESCRIPTION) return s;
  const cut = s.slice(0, MAX_DESCRIPTION);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : MAX_DESCRIPTION).trimEnd()}…`;
}

/** A place's address, shortened to its last parts (city, country): enough to tell namesakes apart. */
function addressLine(v: unknown): string | null {
  const a = str(v);
  if (!a) return null;
  const parts = a
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return short(parts.slice(-2).join(", "));
}

export function yearOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.slice(0, 4)) : Number.NaN;
  return Number.isInteger(n) && n >= 1000 && n <= 2100 ? n : null;
}

/** "WALL·E (2008), directed by…" → 2008: alternatives carry their year only in the description. */
function yearInText(s: string | null): number | null {
  const m = s ? /\((1[89]\d\d|20\d\d)\b/.exec(s) : null;
  return m ? Number(m[1]) : null;
}
