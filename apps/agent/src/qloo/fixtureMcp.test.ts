import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createFixtureMcpClient } from "./fixtureMcp";
import { createQlooGateway } from "./gateway";

const ROOT = fileURLToPath(new URL("../../test/fixtures", import.meta.url));
const NONE = { nickname: null };

describe("fixture MCP client", () => {
  it("serves synthetic envelopes through the real gateway", async () => {
    const gateway = createQlooGateway({ mcp: createFixtureMcpClient(ROOT) });
    expect(await gateway.call("qloo_find_tags", { query: "anything" }, NONE)).toMatchObject({
      kind: "usable",
    });
    expect(await gateway.call("qloo_describe", { entity: "Example Artist A" }, NONE)).toMatchObject(
      { kind: "needs_input" },
    );
    expect((await gateway.capabilities()).state).toBe("no_credential");
  });

  it("answers an honest error when no fixture exists", async () => {
    const gateway = createQlooGateway({ mcp: createFixtureMcpClient(ROOT) });
    const res = await gateway.call("qloo_rank", { options: ["a"], option_type: "movie" }, NONE);
    expect(res).toMatchObject({ kind: "error", envelope: { error: { code: "FIXTURE_MISSING" } } });
  });

  it("never turns an unknown tool name into a file path", async () => {
    const mcp = createFixtureMcpClient(ROOT);
    const res = await mcp.callTool("../../../package", {}, 1000);
    expect(res.structuredContent).toMatchObject({ error: { code: "FIXTURE_MISSING" } });
  });
});
