import { describe, expect, it } from "vitest";
import { harnessEnv } from "./mcpClient";

describe("harnessEnv", () => {
  it("passes only the Qloo variables to the harness, never other secrets", () => {
    const env = harnessEnv({
      QLOO_API_KEY: "qloo-key",
      QLOO_BASE_URL: "https://hackathon.api.qloo.com",
      QLOO_TRUSTED_BASE_URL: "https://hackathon.api.qloo.com",
      DATABASE_URL: "postgres://user:pw@host/db",
      ANTHROPIC_API_KEY: "sk-ant-secret",
      PATH: "/usr/bin",
    });
    expect(env).toEqual({
      QLOO_API_KEY: "qloo-key",
      QLOO_BASE_URL: "https://hackathon.api.qloo.com",
      QLOO_TRUSTED_BASE_URL: "https://hackathon.api.qloo.com",
    });
  });

  it("omits unset or empty variables", () => {
    expect(harnessEnv({ QLOO_API_KEY: "" })).toEqual({});
  });
});
