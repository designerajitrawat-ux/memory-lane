import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health";

const healthy = {
  status: "ok",
  version: "0.1.0",
  uptimeSeconds: 12.5,
  time: "2026-10-12T10:00:00.000Z",
  checks: {
    agent: { ok: true, state: "ok", message: "Agent is running." },
    qloo: { ok: true, state: "ok", message: "Qloo is connected." },
    db: { ok: true, state: "ok", message: "Database is reachable." },
  },
};

describe("HealthResponseSchema", () => {
  it("accepts a healthy response", () => {
    expect(HealthResponseSchema.parse(healthy)).toEqual(healthy);
  });

  it("rejects unknown states", () => {
    const bad = {
      ...healthy,
      checks: { ...healthy.checks, qloo: { ok: false, state: "maybe", message: "" } },
    };
    expect(HealthResponseSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects overly long messages so raw error dumps cannot slip through", () => {
    const bad = {
      ...healthy,
      checks: { ...healthy.checks, db: { ok: false, state: "error", message: "x".repeat(201) } },
    };
    expect(HealthResponseSchema.safeParse(bad).success).toBe(false);
  });
});
