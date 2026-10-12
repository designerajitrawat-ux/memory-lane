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
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ NODE_ENV: "production", WEB_ORIGIN: "http://a.example" })).toThrow(
      /WEB_ORIGIN/,
    );
    expect(() => loadEnv({ NODE_ENV: "production", WEB_ORIGIN: "*" })).toThrow(/WEB_ORIGIN/);
    expect(
      loadEnv({ NODE_ENV: "production", WEB_ORIGIN: "https://memory-lane.vercel.app" }).WEB_ORIGIN,
    ).toEqual(["https://memory-lane.vercel.app"]);
  });

  it("rejects origins with a path or trailing slash", () => {
    expect(() => loadEnv({ WEB_ORIGIN: "https://a.example/" })).toThrow(/WEB_ORIGIN/);
    expect(() => loadEnv({ WEB_ORIGIN: "https://a.example/app" })).toThrow(/WEB_ORIGIN/);
  });

  it("names bad variables without echoing their values", () => {
    expect(() => loadEnv({ PORT: "not-a-port-s3cret" })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: "not-a-port-s3cret" })).not.toThrow(/s3cret/);
  });
});
