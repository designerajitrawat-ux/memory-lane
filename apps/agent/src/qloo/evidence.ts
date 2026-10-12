import { randomUUID } from "node:crypto";
import type { QlooEnvelope } from "@memory-lane/shared";
import { qlooCalls } from "../db/schema";
import type { AppDb } from "../db/types";

export interface DigestItem {
  id?: string;
  name?: string;
  type?: string;
}

export interface EvidenceRecord {
  tool: string;
  args: unknown; // already passed the PII guard
  envelope: QlooEnvelope;
  cached: boolean;
  latencyMs: number;
}

export interface EvidenceStore {
  /** Writes one qloo_calls row and returns its id (the evidence_id items carry). */
  record(entry: EvidenceRecord): Promise<string>;
}

const MAX_DIGEST = 10;
const MAX_TEXT = 200;

/**
 * A small, shape-agnostic digest of results ({id, name, type} for up to 10 items) so validators can
 * check that an item really came from this call. Kept in our private DB only (never in the repo).
 */
export function resultsDigest(results: unknown): DigestItem[] {
  const list = Array.isArray(results)
    ? results
    : results && typeof results === "object"
      ? (Object.values(results).find(Array.isArray) ?? [])
      : [];
  const digest: DigestItem[] = [];
  for (const raw of list as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const item: DigestItem = {};
    const id = str(r.entity_id ?? r.id ?? r.tag_id);
    const name = str(r.name ?? r.title);
    const type = str(r.type ?? r.subtype ?? r.entity_type);
    if (id) item.id = id;
    if (name) item.name = name;
    if (type) item.type = type;
    if (item.id || item.name) digest.push(item);
    if (digest.length >= MAX_DIGEST) break;
  }
  return digest;
}

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, MAX_TEXT) : undefined);

function row({ tool, args, envelope, cached, latencyMs }: EvidenceRecord) {
  return {
    tool,
    argsChecked: args,
    status: envelope.status,
    summary: envelope.summary?.slice(0, 1000) ?? null,
    resultCount: envelope.result_count ?? 0,
    resultsDigest: resultsDigest(envelope.results),
    cached,
    latencyMs: Math.round(latencyMs),
  };
}

export function createPgEvidenceStore(db: AppDb): EvidenceStore {
  return {
    async record(entry) {
      const [inserted] = await db
        .insert(qlooCalls)
        .values(row(entry))
        .returning({ id: qlooCalls.id });
      if (!inserted) throw new Error("evidence insert returned no row");
      return inserted.id;
    },
  };
}

export function createMemoryEvidenceStore(): EvidenceStore & {
  rows: (ReturnType<typeof row> & { id: string })[];
} {
  const rows: (ReturnType<typeof row> & { id: string })[] = [];
  return {
    rows,
    async record(entry) {
      const id = randomUUID();
      rows.push({ id, ...row(entry) });
      return id;
    },
  };
}
