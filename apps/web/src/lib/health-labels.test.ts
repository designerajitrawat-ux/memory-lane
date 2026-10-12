import { describe, expect, it } from "vitest";
import type { HealthResponse } from "@memory-lane/shared";
import { canRetry, describeHealth } from "./health-labels";

const health = (overrides: Partial<HealthResponse["checks"]> = {}): HealthResponse => ({
  status: Object.keys(overrides).length ? "degraded" : "ok",
  version: "0.1.0",
  uptimeSeconds: 1,
  time: "2026-10-12T10:00:00.000Z",
  checks: {
    agent: { ok: true, state: "ok", message: "Agent is running." },
    qloo: { ok: true, state: "ok", message: "Qloo is connected and ready." },
    db: { ok: true, state: "ok", message: "Database is reachable." },
    ...overrides,
  },
});

describe("describeHealth", () => {
  it("marks everything ready, with spoken text for screen readers", () => {
    const view = describeHealth({ kind: "ok", health: health() });
    expect(view.items.map((i) => i.tone)).toEqual(["ok", "ok", "ok"]);
    expect(view.items.map((i) => i.spoken)).toEqual([
      "Agent: ready",
      "Qloo: ready",
      "Database: ready",
    ]);
  });

  it("is honest while the Qloo key is missing", () => {
    const view = describeHealth({
      kind: "ok",
      health: health({ qloo: { ok: false, state: "no_credential", message: "no key" } }),
    });
    expect(view.items[1]).toMatchObject({
      label: "Qloo: waiting for API key",
      spoken: "Qloo: waiting for API key",
      tone: "warn",
    });
    expect(view.summary).toBe("Some parts aren't ready yet.");
  });

  it("says plainly when today's Qloo limit is reached", () => {
    const view = describeHealth({
      kind: "ok",
      health: health({ qloo: { ok: false, state: "quota_exhausted", message: "limit" } }),
    });
    expect(view.items[1]?.label).toBe("Qloo: today's limit reached");
  });

  it("marks everything unknown when the agent can't be reached", () => {
    const view = describeHealth({ kind: "unreachable" });
    expect(view.items.map((i) => i.tone)).toEqual(["warn", "unknown", "unknown"]);
    expect(view.items[1]?.label).toBe("Qloo: unknown");
    expect(view.summary).toMatch(/Can't reach/);
  });

  it("has distinct copy for offline and invalid answers", () => {
    expect(describeHealth({ kind: "offline" }).summary).toMatch(/offline/);
    expect(describeHealth({ kind: "invalid" }).items[0]?.detail).toMatch(/format/);
  });
});

describe("canRetry", () => {
  it("offers a retry for anything short of fully healthy", () => {
    expect(canRetry({ kind: "ok", health: health() })).toBe(false);
    expect(
      canRetry({
        kind: "ok",
        health: health({ db: { ok: false, state: "error", message: "down" } }),
      }),
    ).toBe(true);
    expect(canRetry({ kind: "unreachable" })).toBe(true);
  });
});
