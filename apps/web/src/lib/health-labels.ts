import type { DbState, HealthResponse, QlooState } from "@memory-lane/shared";

export type Tone = "ok" | "warn" | "unknown";

export interface StatusItem {
  key: "agent" | "qloo" | "db";
  /** Visible text; the tone icon next to it carries ✓ / ✗ / ? visually. */
  label: string;
  /** What screen readers announce instead of label + icon. */
  spoken: string;
  tone: Tone;
  detail: string;
}

export interface HealthView {
  summary: string;
  items: StatusItem[];
}

export type HealthResult =
  | { kind: "ok"; health: HealthResponse }
  | { kind: "unreachable" }
  | { kind: "offline" }
  | { kind: "invalid" };

const QLOO_LABEL: Record<QlooState, string> = {
  ok: "Qloo",
  no_credential: "Qloo: waiting for API key",
  quota_exhausted: "Qloo: today's limit reached",
  unavailable: "Qloo: unavailable",
};

const DB_LABEL: Record<DbState, string> = {
  ok: "Database",
  not_configured: "Database: not set up yet",
  error: "Database: unreachable",
};

const SUMMARY: Record<Exclude<HealthResult["kind"], "ok">, string> = {
  unreachable: "Can't reach the agent right now.",
  offline: "You seem to be offline. Check your connection, then try again.",
  invalid: "The agent sent an unexpected answer.",
};

function item(key: StatusItem["key"], label: string, ok: boolean, detail: string): StatusItem {
  return { key, label, spoken: ok ? `${label}: ready` : label, tone: ok ? "ok" : "warn", detail };
}

function unknown(key: StatusItem["key"], name: string): StatusItem {
  const label = `${name}: unknown`;
  return { key, label, spoken: label, tone: "unknown", detail: "Unknown until the agent answers." };
}

/** Turns the agent's health answer (or the lack of one) into honest, human labels. */
export function describeHealth(result: HealthResult): HealthView {
  if (result.kind !== "ok") {
    const agentDetail =
      result.kind === "invalid"
        ? "The agent answered, but not in the format we expected."
        : "No answer from the agent.";
    return {
      summary: SUMMARY[result.kind],
      items: [
        item("agent", "Agent: not responding", false, agentDetail),
        unknown("qloo", "Qloo"),
        unknown("db", "Database"),
      ],
    };
  }

  const { agent, qloo, db } = result.health.checks;
  return {
    summary:
      result.health.status === "ok" ? "Everything is ready." : "Some parts aren't ready yet.",
    items: [
      item("agent", agent.ok ? "Agent" : "Agent: not ready", agent.ok, agent.message),
      item("qloo", QLOO_LABEL[qloo.state], qloo.ok, qloo.message),
      item("db", DB_LABEL[db.state], db.ok, db.message),
    ],
  };
}

/** Whether a "Try again" makes sense: anything short of a fully healthy answer. */
export function canRetry(result: HealthResult): boolean {
  return result.kind !== "ok" || result.health.status !== "ok";
}
