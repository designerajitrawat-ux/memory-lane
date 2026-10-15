import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpToolResult {
  structuredContent?: unknown;
  isError?: boolean;
}

export interface QlooMcpClient {
  callTool(name: string, args: Record<string, unknown>, timeoutMs: number): Promise<McpToolResult>;
  close(): Promise<void>;
}

// Only what the harness needs. The MCP SDK adds a safe default set (PATH, HOME/USERPROFILE, …);
// DATABASE_URL, LLM_API_KEY and any other secret must never reach this third-party process.
const HARNESS_ENV_KEYS = [
  "QLOO_API_KEY",
  "QLOO_HOME",
  "QLOO_BASE_URL",
  "QLOO_TRUSTED_BASE_URL",
] as const;

export function harnessEnv(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of HARNESS_ENV_KEYS) {
    const value = source[key];
    if (value) env[key] = value;
  }
  return env;
}

/**
 * One long-lived `qloo mcp` child process per agent process (docs/03 §5). Connects lazily, and if
 * the child exits (or a connect times out) the next call starts a fresh one. Only qloo/gateway.ts
 * may use this.
 */
export function createQlooMcpClient(command: string): QlooMcpClient {
  let connecting: Promise<Client> | null = null;

  async function connect(): Promise<Client> {
    const transport = new StdioClientTransport({
      command,
      args: ["mcp"],
      env: harnessEnv(),
      stderr: "ignore",
    });
    const client = new Client({ name: "memory-lane-agent", version: "0.1.0" });
    transport.onclose = () => {
      connecting = null;
    };
    await client.connect(transport);
    return client;
  }

  function getClient(): Promise<Client> {
    if (!connecting) {
      connecting = connect().catch((err: unknown) => {
        connecting = null;
        throw err;
      });
    }
    return connecting;
  }

  return {
    async callTool(name, args, timeoutMs) {
      const pending = getClient();
      let client: Client;
      try {
        client = await withTimeout(pending, timeoutMs, "qloo mcp connect");
      } catch (err) {
        // A hung start must not block every later call: drop it and close it if it ever connects.
        if (connecting === pending) connecting = null;
        pending.then((c) => c.close()).catch(() => {});
        throw err;
      }
      const res = await client.callTool({ name, arguments: args }, undefined, {
        timeout: timeoutMs,
      });
      return { structuredContent: res.structuredContent, isError: res.isError === true };
    },
    async close() {
      const pending = connecting;
      connecting = null;
      if (pending) await (await pending.catch(() => null))?.close();
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
