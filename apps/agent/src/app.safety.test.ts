import { describe, expect, it } from "vitest";
import { buildApp, safeErr } from "./app";

describe("safeErr (log serializer)", () => {
  it("drops SQL text and parameters from query errors, keeps the code", () => {
    const err = Object.assign(new Error("Failed query: insert …\nparams: Bimla,secret"), {
      name: "DrizzleQueryError",
      query: "insert …",
      params: ["Bimla", "secret"],
      cause: { code: "23505" },
    });
    const out = safeErr(err);
    expect(out).toMatchObject({ type: "DrizzleQueryError", code: "23505" });
    expect(JSON.stringify(out)).not.toMatch(/Bimla|secret|insert/);
  });

  it("keeps message and stack for ordinary errors", () => {
    expect(safeErr(new Error("boom"))).toMatchObject({ type: "Error", message: "boom" });
  });
});

describe("health after a failed migration", () => {
  it("reports the database as not ready even if it answers pings", async () => {
    const app = await buildApp({
      gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
      db: { ping: async () => ({ ok: true, state: "ok", message: "up" }), close: async () => {} },
      dbSetupFailed: true,
      version: "test",
      webOrigins: ["https://x.example"],
      logger: false,
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json().checks.db).toMatchObject({ ok: false, state: "error" });
    await app.close();
  });
});
