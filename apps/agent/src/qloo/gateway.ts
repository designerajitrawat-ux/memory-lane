import { z } from "zod";
import type { QlooCheck } from "@memory-lane/shared";
import type { QlooMcpClient } from "./mcpClient";

/**
 * The only way the agent talks to Qloo (CLAUDE.md rule 4). Phase 1 exposes the readiness check;
 * Phase 2 adds the allow-list, arg redaction, cache, evidence log and budget here.
 */
export interface QlooGateway {
  capabilities(): Promise<QlooCheck>;
}

// qloo_capabilities answers locally (no Qloo API call, no quota). `adapter.ready` is false until
// the harness has a Qloo credential.
const CapabilitiesSchema = z.object({
  adapter: z.object({ ready: z.boolean() }),
});

const CAPABILITIES_TIMEOUT_MS = 20_000; // first call also starts `qloo mcp` (~10 s cold)

export function createQlooGateway(mcp: QlooMcpClient): QlooGateway {
  return {
    async capabilities() {
      let res;
      try {
        res = await mcp.callTool("qloo_capabilities", {}, CAPABILITIES_TIMEOUT_MS);
      } catch {
        return unavailable("Couldn't start or reach the Qloo tools.");
      }
      const parsed = CapabilitiesSchema.safeParse(res.structuredContent);
      if (res.isError || !parsed.success) {
        return unavailable("The Qloo tools sent an unexpected readiness answer.");
      }
      return parsed.data.adapter.ready
        ? { ok: true, state: "ok", message: "Qloo is connected and ready." }
        : {
            ok: false,
            state: "no_credential",
            message: "Qloo tools are running but have no API key yet.",
          };
    },
  };
}

function unavailable(message: string): QlooCheck {
  return { ok: false, state: "unavailable", message };
}
