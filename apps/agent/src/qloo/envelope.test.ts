import { describe, expect, it } from "vitest";
import authError from "../../test/fixtures/harness/qloo-auth-error.json";
import recommendOk from "../../test/fixtures/synthetic/qloo_recommend.json";
import { classify, isRetryable, parseEnvelope } from "./envelope";

describe("parseEnvelope / classify", () => {
  it("reads the real harness QLOO_AUTH error as a non-retryable error", () => {
    const env = parseEnvelope(authError.structuredContent, "qloo_find_tags");
    expect(classify(env)).toBe("error");
    expect(env.error?.code).toBe("QLOO_AUTH");
    expect(isRetryable(env)).toBe(false);
  });

  it("classifies statuses per docs/03 §4", () => {
    const base = recommendOk.structuredContent;
    expect(classify(parseEnvelope(base, "x"))).toBe("usable");
    expect(classify(parseEnvelope({ ...base, status: "partial" }, "x"))).toBe("usable");
    expect(classify(parseEnvelope({ ...base, status: "degraded" }, "x"))).toBe("usable");
    expect(classify(parseEnvelope({ ...base, status: "needs_input" }, "x"))).toBe("needs_input");
    expect(classify(parseEnvelope({ ...base, status: "empty", results: [] }, "x"))).toBe("empty");
  });

  it("turns a missing or malformed envelope into a local, non-retryable error", () => {
    for (const bad of [undefined, null, { status: "ok" }, { hello: "world" }]) {
      const env = parseEnvelope(bad, "qloo_rank");
      expect(env).toMatchObject({
        status: "error",
        operation: "qloo_rank",
        error: { code: "INVALID_ENVELOPE", retryable: false },
      });
    }
  });

  it("only treats errors flagged retryable as retryable", () => {
    const retry = {
      ...authError.structuredContent,
      error: { ...authError.structuredContent.error, retryable: true },
    };
    expect(isRetryable(parseEnvelope(retry, "x"))).toBe(true);
  });
});
