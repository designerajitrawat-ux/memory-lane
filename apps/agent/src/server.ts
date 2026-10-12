import pkg from "../package.json";
import { buildApp } from "./app";
import { createDb } from "./db/client";
import { loadEnv } from "./env";
import { createQlooGateway } from "./qloo/gateway";
import { createQlooMcpClient } from "./qloo/mcpClient";

async function main() {
  const env = loadEnv();
  const mcp = createQlooMcpClient(env.QLOO_MCP_COMMAND);
  const gateway = createQlooGateway(mcp);
  const db = createDb(env.DATABASE_URL, { verifyTls: env.NODE_ENV === "production" });
  const commit = process.env.RENDER_GIT_COMMIT?.slice(0, 7);

  const app = await buildApp({
    gateway,
    db,
    version: commit ? `${pkg.version}+${commit}` : pkg.version,
    webOrigins: env.WEB_ORIGIN,
    trustProxyHops: env.TRUST_PROXY_HOPS,
  });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await Promise.allSettled([mcp.close(), db?.close()]);
    process.exit(0);
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ host: "0.0.0.0", port: env.PORT });

  // Warm up `qloo mcp` (cold start is ~10 s) so the first health check is quick.
  void gateway.capabilities().then((q) => app.log.info({ qloo: q.state }, "qloo readiness"));
}

main().catch((err: unknown) => {
  // Startup errors only (bad env, port in use). Env values are never part of these messages.
  process.stderr.write(
    `agent failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
