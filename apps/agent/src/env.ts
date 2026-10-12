import { z } from "zod";

// Secrets (QLOO_API_KEY, ANTHROPIC_API_KEY, DATABASE_URL) are read from the process env only and
// are never logged. QLOO_API_KEY is not read here at all: the qloo harness reads it itself from the
// allow-listed env we pass to the MCP child process (qloo/mcpClient.ts).
const DEV_WEB_ORIGIN = "http://localhost:3000";

const isOrigin = (s: string) => {
  try {
    return new URL(s).origin === s;
  } catch {
    return false;
  }
};

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(8787),
    // CORS allow-list: comma-separated origins (no path, no trailing slash). Required in production.
    WEB_ORIGIN: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    DATABASE_URL: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    QLOO_MCP_COMMAND: z.string().default("qloo"),
    // Number of reverse proxies in front of the agent (see render.yaml), so rate limits see the client IP.
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((env, ctx) => {
    const prod = env.NODE_ENV === "production";
    if (prod && env.WEB_ORIGIN.length === 0) {
      ctx.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "required in production" });
    }
    if (env.WEB_ORIGIN.some((o) => !isOrigin(o) || (prod && !o.startsWith("https://")))) {
      ctx.addIssue({ code: "custom", path: ["WEB_ORIGIN"], message: "must be exact origins" });
    }
  })
  .transform((env) => ({
    ...env,
    WEB_ORIGIN: env.WEB_ORIGIN.length ? env.WEB_ORIGIN : [DEV_WEB_ORIGIN],
  }));

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Report which variables are wrong, never their values.
    const names = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ");
    throw new Error(`Invalid environment variables: ${names}`);
  }
  return parsed.data;
}
