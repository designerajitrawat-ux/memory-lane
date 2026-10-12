import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { QlooToolNameSchema } from "@memory-lane/shared";
import { cacheKey } from "./cache";
import { localError } from "./envelope";
import type { McpToolResult, QlooMcpClient } from "./mcpClient";

interface FixtureFile {
  isError?: boolean;
  structuredContent: unknown;
}

/**
 * A fake `qloo mcp` for tests and offline dev: the real gateway runs on top of it. Looks up
 *   1. <root>/recorded/<tool>/<cacheKey>.json  — real recordings, gitignored, local only
 *   2. <root>/synthetic/<tool>.json            — hand-written, committed
 *   3. <root>/harness/qloo-capabilities.no-credential.json for qloo_capabilities
 */
export function createFixtureMcpClient(root: string): QlooMcpClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async callTool(name, args): Promise<McpToolResult> {
      calls.push(name);
      const known = name === "qloo_capabilities" || QlooToolNameSchema.safeParse(name).success;
      const candidates = !known
        ? []
        : name === "qloo_capabilities"
          ? [join(root, "harness", "qloo-capabilities.no-credential.json")]
          : [
              join(root, "recorded", name, `${cacheKey(name, args)}.json`),
              join(root, "synthetic", `${name}.json`),
            ];
      for (const file of candidates) {
        const fixture = await readJson(file);
        if (fixture)
          return {
            structuredContent: fixture.structuredContent,
            isError: fixture.isError === true,
          };
      }
      const missing = localError(name, "FIXTURE_MISSING", `No fixture for ${name}.`, {
        retryable: false,
        recovery:
          "Add a synthetic fixture or record one with `pnpm --filter @memory-lane/agent record`.",
      });
      return { structuredContent: missing, isError: true };
    },
    async close() {},
  };
}

async function readJson(file: string): Promise<FixtureFile | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as FixtureFile;
  } catch {
    return null;
  }
}
