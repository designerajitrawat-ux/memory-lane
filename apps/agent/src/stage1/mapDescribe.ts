import type { Domain, QlooEnvelope } from "@memory-lane/shared";

export interface MappedCandidate {
  entityId: string;
  name: string;
  entityType: string | null;
  year: number | null;
}

const MAX_CANDIDATES = 5;

/**
 * PROVISIONAL: turns a `qloo_describe` envelope into candidates the caregiver can choose from. The real
 * result shape is only known once the Qloo key arrives (Phase 0); until then this reads the common
 * fields generically. TODO(phase-0): pin the field names against recorded fixtures.
 */
export function mapDescribe(envelope: QlooEnvelope): MappedCandidate[] {
  const results = envelope.results;
  const list = Array.isArray(results)
    ? results
    : results && typeof results === "object"
      ? (Object.values(results).find(Array.isArray) ?? [])
      : [];
  const out: MappedCandidate[] = [];
  for (const raw of list as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const props = (r.properties && typeof r.properties === "object" ? r.properties : {}) as Record<
      string,
      unknown
    >;
    const entityId = str(r.entity_id ?? r.id);
    const name = str(r.name ?? r.title);
    if (!entityId || !name) continue;
    out.push({
      entityId,
      name,
      entityType: humanType(str(r.type ?? r.subtype ?? r.entity_type)),
      year: yearOf(
        props.release_year ??
          r.release_year ??
          props.year ??
          r.year ??
          props.release_date ??
          r.release_date,
      ),
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

/** The Qloo entity type to ask for, per wizard domain (provisional; food/other let Qloo decide). */
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

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined;

/** "urn:entity:tv_show" → "tv show". */
function humanType(t: string | undefined): string | null {
  if (!t) return null;
  return (t.split(":").pop() ?? t).replace(/_/g, " ");
}

function yearOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.slice(0, 4)) : Number.NaN;
  return Number.isInteger(n) && n >= 1000 && n <= 2100 ? n : null;
}
