import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(8787);
    expect(env.WEB_ORIGIN).toEqual(["http://localhost:3000"]);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.TRUST_PROXY_HOPS).toBe(0);
  });

  it("splits a comma-separated WEB_ORIGIN and treats an empty DATABASE_URL as unset", () => {
    const env = loadEnv({ WEB_ORIGIN: "https://a.example, https://b.example", DATABASE_URL: "" });
    expect(env.WEB_ORIGIN).toEqual(["https://a.example", "https://b.example"]);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("requires exact https origins for WEB_ORIGIN in production", () => {
    const prod = { NODE_ENV: "production", DATABASE_URL: "postgres://db/x" } as const;
    expect(() => loadEnv(prod)).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ ...prod, WEB_ORIGIN: "http://a.example" })).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ ...prod, WEB_ORIGIN: "*" })).toThrow(/WEB_ORIGIN/);
    expect(loadEnv({ ...prod, WEB_ORIGIN: "https://memory-lane.vercel.app" }).WEB_ORIGIN).toEqual([
      "https://memory-lane.vercel.app",
    ]);
  });

  it("requires DATABASE_URL in production so the daily budget can't reset on restart", () => {
    expect(() =>
      loadEnv({ NODE_ENV: "production", WEB_ORIGIN: "https://memory-lane.vercel.app" }),
    ).toThrow(/DATABASE_URL/);
  });

  it("rejects origins with a path or trailing slash", () => {
    expect(() => loadEnv({ WEB_ORIGIN: "https://a.example/" })).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ WEB_ORIGIN: "https://a.example/app" })).toThrow(/WEB_ORIGIN/);
  });

  it("refuses fixture answers in production (CLAUDE.md rule 3)", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "postgres://db/x",
        WEB_ORIGIN: "https://memory-lane.vercel.app",
        QLOO_FIXTURE_DIR: "test/fixtures",
      }),
    ).toThrow(/QLOO_FIXTURE_DIR/);
    expect(loadEnv({ QLOO_FIXTURE_DIR: "test/fixtures" }).QLOO_FIXTURE_DIR).toBe("test/fixtures");
  });

  it("refuses the in-memory dev database in production", () => {
    expect(() =>
      loadEnv({
        NODE_ENV: "production",
        DATABASE_URL: "pglite:memory",
        WEB_ORIGIN: "https://memory-lane.vercel.app",
      }),
    ).toThrow(/DATABASE_URL/);
    expect(loadEnv({ DATABASE_URL: "pglite:memory" }).DATABASE_URL).toBe("pglite:memory");
  });

  it("keeps the demo reserve within the daily Qloo budget", () => {
    expect(() => loadEnv({ DAILY_QLOO_CALL_BUDGET: "50", QLOO_BUDGET_RESERVE: "60" })).toThrow(
      /QLOO_BUDGET_RESERVE/,
    );
  });

  it("names bad variables without echoing their values", () => {
    expect(() => loadEnv({ PORT: "not-a-port-s3cret" })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: "not-a-port-s3cret" })).not.toThrow(/s3cret/);
  });
});
