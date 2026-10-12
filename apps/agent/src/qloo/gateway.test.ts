import { describe, expect, it } from "vitest";
import fixture from "../../test/fixtures/qloo-capabilities.no-credential.json";
import { createQlooGateway } from "./gateway";
import type { McpToolResult, QlooMcpClient } from "./mcpClient";

function fakeMcp(result: McpToolResult | Error): QlooMcpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async callTool(name) {
      calls.push(name);
      if (result instanceof Error) throw result;
      return result;
    },
    async close() {},
  };
}

describe("QlooGateway.capabilities", () => {
  it("reports no_credential for the recorded harness answer without a key", async () => {
    const mcp = fakeMcp({ structuredContent: fixture.structuredContent });
    const check = await createQlooGateway(mcp).capabilities();
    expect(check).toMatchObject({ ok: false, state: "no_credential" });
    expect(mcp.calls).toEqual(["qloo_capabilities"]);
  });

  it("reports ok when the adapter is ready", async () => {
    // Derived from the recorded fixture with ready flipped; replace with a real recording once the key arrives.
    const ready = {
      ...fixture.structuredContent,
      adapter: { ...fixture.structuredContent.adapter, ready: true },
    };
    const check = await createQlooGateway(fakeMcp({ structuredContent: ready })).capabilities();
    expect(check).toEqual({ ok: true, state: "ok", message: "Qloo is connected and ready." });
  });

  it("reports unavailable without leaking the underlying error", async () => {
    const check = await createQlooGateway(
      fakeMcp(new Error("spawn qloo ENOENT C:\\secret\\path")),
    ).capabilities();
    expect(check.state).toBe("unavailable");
    expect(check.message).not.toMatch(/ENOENT|secret|path/);
  });

  it("reports unavailable for an unexpected or error result", async () => {
    const gw1 = createQlooGateway(fakeMcp({ structuredContent: { something: "else" } }));
    const gw2 = createQlooGateway(
      fakeMcp({ structuredContent: fixture.structuredContent, isError: true }),
    );
    expect((await gw1.capabilities()).state).toBe("unavailable");
    expect((await gw2.capabilities()).state).toBe("unavailable");
  });
});
