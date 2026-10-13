// Phase-2 live gate: makes 3 real Qloo calls through the gateway and saves the envelopes to the
// gitignored test/fixtures/recorded/ folder. Real Qloo responses must NEVER be committed (Qloo
// developer guide). Run once the key is set up:  pnpm --filter @memory-lane/agent record
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheKey } from "../src/qloo/cache";
import { createQlooGateway } from "../src/qloo/gateway";
import { createQlooMcpClient } from "../src/qloo/mcpClient";

const CALLS = [
  { tool: "qloo_find_tags", args: { query: "ghazal", limit: 5 } },
  { tool: "qloo_describe", args: { entity: "Mohammed Rafi", type: "artist" } },
  { tool: "qloo_recommend", args: { target_type: "movie", signals: ["Mohammed Rafi"], limit: 5 } },
  // Stage 1 shapes: a film (year?), a short ambiguous name, and a dish (no Qloo entity type for food).
  { tool: "qloo_describe", args: { entity: "Mughal-e-Azam", type: "movie" } },
  { tool: "qloo_describe", args: { entity: "Rafi", type: "artist" } },
  { tool: "qloo_describe", args: { entity: "Butter chicken" } },
] as const;

const out = (line: string) => process.stdout.write(`${line}\n`);

// Always this package's folder, whatever the working directory.
const RECORDED_DIR = fileURLToPath(new URL("../test/fixtures/recorded/", import.meta.url));

/** Refuses to write unless git confirms the path is ignored, so a real response can't be committed. */
function assertGitIgnored(file: string) {
  try {
    execFileSync("git", ["check-ignore", "-q", file], { stdio: "ignore" });
  } catch {
    throw new Error(`refusing to write ${file}: it is not gitignored`);
  }
}

async function main() {
  const mcp = createQlooMcpClient(process.env.QLOO_MCP_COMMAND ?? "qloo");
  // Each call may retry twice; allow for that so a flaky moment doesn't abort the recording.
  const gateway = createQlooGateway({ mcp, dailyBudget: CALLS.length * 3 });
  try {
    const ready = await gateway.capabilities();
    if (ready.state !== "ok") {
      out(`Qloo is not ready (${ready.state}): ${ready.message}`);
      process.exitCode = 1;
      return;
    }
    for (const { tool, args } of CALLS) {
      const result = await gateway.call(tool, args, { nickname: null });
      if (!("envelope" in result)) {
        out(`${tool}: ${result.kind}`);
        process.exitCode = 1;
        continue;
      }
      const file = join(RECORDED_DIR, tool, `${cacheKey(tool, args)}.json`);
      assertGitIgnored(file);
      await mkdir(join(RECORDED_DIR, tool), { recursive: true });
      const fixture = {
        _note: "REAL Qloo response recorded locally. Never commit (gitignored).",
        tool,
        args,
        recordedAt: new Date().toISOString(),
        isError: result.kind === "error",
        structuredContent: result.envelope,
      };
      await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`);
      out(
        `${tool}: ${result.envelope.status} (${result.envelope.result_count ?? 0} results) → ${file}`,
      );
    }
  } finally {
    await mcp.close();
  }
}

main().catch((err: unknown) => {
  out(`recording failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
