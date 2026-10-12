import { describe, expect, it } from "vitest";
import recommendOk from "../../test/fixtures/synthetic/qloo_recommend.json";
import { parseEnvelope } from "./envelope";
import { cacheKey, canonicalJson, createMemoryCacheStore } from "./cache";

describe("cacheKey", () => {
  it("ignores key order and undefined values", () => {
    const a = cacheKey("qloo_recommend", { target_type: "movie", signals: ["A", "B"], limit: 5 });
    const b = cacheKey("qloo_recommend", {
      limit: 5,
      signals: ["A", "B"],
      target_type: "movie",
      explain: undefined,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs by tool and by list order", () => {
    const args = { signals: ["A", "B"], target_type: "movie" };
    expect(cacheKey("qloo_recommend", args)).not.toBe(cacheKey("qloo_rank", args));
    expect(cacheKey("qloo_recommend", args)).not.toBe(
      cacheKey("qloo_recommend", { signals: ["B", "A"], target_type: "movie" }),
    );
  });

  it("canonicalJson sorts nested keys", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe(
      '{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}',
    );
  });
});

describe("memory cache store", () => {
  it("expires entries but keeps persistent ones", async () => {
    let t = 1_000;
    const store = createMemoryCacheStore(() => t);
    const envelope = parseEnvelope(recommendOk.structuredContent, "qloo_recommend");
    await store.set({ key: "ttl", tool: "x", args: {}, envelope, expiresAt: new Date(2_000) });
    await store.set({ key: "forever", tool: "x", args: {}, envelope, expiresAt: null });
    expect(await store.get("ttl")).not.toBeNull();
    t = 2_000;
    expect(await store.get("ttl")).toBeNull();
    expect(await store.get("forever")).not.toBeNull();
  });
});
