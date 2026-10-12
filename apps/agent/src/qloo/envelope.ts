import { QlooEnvelopeSchema, type QlooEnvelope } from "@memory-lane/shared";

export type EnvelopeKind = "usable" | "needs_input" | "empty" | "error";

/** Parses an MCP tool result; anything without a valid envelope becomes a local, non-retryable error. */
export function parseEnvelope(structuredContent: unknown, operation: string): QlooEnvelope {
  const parsed = QlooEnvelopeSchema.safeParse(structuredContent);
  if (parsed.success) return parsed.data;
  return localError(
    operation,
    "INVALID_ENVELOPE",
    "The Qloo tools sent an answer we couldn't read.",
    {
      retryable: false,
      recovery: "Try again later. If it keeps happening, the harness version may have changed.",
    },
  );
}

export function localError(
  operation: string,
  code: string,
  summary: string,
  { retryable, recovery }: { retryable: boolean; recovery: string },
): QlooEnvelope {
  return {
    schema_version: "local",
    operation,
    status: "error",
    summary,
    results: [],
    result_count: 0,
    error: { code, layer: "gateway", retryable, recovery },
  };
}

/** docs/03 §4: ok/partial/degraded are usable (partial/degraded get a badge); the rest are not. */
export function classify(envelope: QlooEnvelope): EnvelopeKind {
  switch (envelope.status) {
    case "ok":
    case "partial":
    case "degraded":
      return "usable";
    case "needs_input":
      return "needs_input";
    case "empty":
      return "empty";
    case "error":
      return "error";
  }
}

export function isRetryable(envelope: QlooEnvelope): boolean {
  return envelope.status === "error" && envelope.error?.retryable === true;
}
