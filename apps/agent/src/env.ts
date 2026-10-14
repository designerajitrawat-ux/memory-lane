import { z } from "zod";

// Secrets (QLOO_API_KEY, LLM_API_KEY, DATABASE_URL) are read from the process env only and
// are never logged. QLOO_API_KEY is not read here at all: the qloo harness reads it itself from the
// allow-listed env we pass to the MCP child process (qloo/mcpClient.ts).
const DEV_WEB_ORIGIN = "http://localhost:3000";

/** DEV ONLY in-process Postgres (`DATABASE_URL=pglite:memory`); refused in production. */
export const isPgliteUrl = (url: string | undefined) => url?.startsWith("pglite:") ?? false;

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
    // Header the edge overwrites with the real client IP (Render: cf-connecting-ip). Used for rate limits.
    // Only headers an edge overwrites; never x-forwarded-for / x-real-ip, which clients can set.
    CLIENT_IP_HEADER: z.enum(["cf-connecting-ip", "true-client-ip"]).optional(),
    // Profile limits and retention (docs/07 §2.8).
    PROFILES_PER_OWNER: z.coerce.number().int().min(1).default(20),
    PROFILES_PER_DAY: z.coerce.number().int().min(0).default(200),
    PROFILE_RETENTION_DAYS: z.coerce.number().int().min(1).default(90),
    // DEV ONLY: serve Qloo answers from fixture files (synthetic envelopes) instead of `qloo mcp`.
    QLOO_FIXTURE_DIR: z.string().optional(),
    // Live Qloo calls per UTC day (shared hackathon quota); cache hits don't count.
    DAILY_QLOO_CALL_BUDGET: z.coerce.number().int().min(0).default(500),
    QLOO_CACHE_TTL_DAYS: z.coerce.number().positive().default(7),
    // Budget units user-triggered research must leave for demo personas and judges.
    QLOO_BUDGET_RESERVE: z.coerce.number().int().min(0).default(100),
    // Stage 1 favourite lookups per device token and per client IP (/64) in 24 h (in memory).
    STAGE1_LOOKUPS_PER_OWNER_DAY: z.coerce.number().int().min(1).default(50),
    STAGE1_LOOKUPS_PER_CLIENT_DAY: z.coerce.number().int().min(1).default(100),
    // The LLM steps (compare baseline, era proposals for Qloo to rank, warmer prompts): any
    // OpenAI-compatible Chat Completions API. Without a key those steps are honestly switched off.
    LLM_API_KEY: z
      .string()
      .optional()
      .transform((v) => v?.trim() || undefined),
    LLM_BASE_URL: z.url({ protocol: /^https$/ }).default("https://api.openai.com/v1"),
    LLM_MODEL: z.string().trim().min(1).default("gpt-6-luna"),
    // Sent only when set (OpenAI reasoning models); "none" turns it off for other providers.
    LLM_REASONING_EFFORT: z.enum(["none", "low", "medium", "high"]).default("low"),
    // LLM calls per UTC day across everyone (cache hits don't count): keeps spend bounded.
    LLM_DAILY_CALLS: z.coerce.number().int().min(0).default(400),
    // Seed the three fictional demo personas at startup (default: on in production, off elsewhere).
    SEED_DEMOS: z.enum(["0", "1"]).optional(),
    // SQL migrations applied at startup (relative to the working directory).
    MIGRATIONS_DIR: z.string().default("drizzle"),
  })
  .superRefine((env, ctx) => {
    const prod = env.NODE_ENV === "production";
    if (prod && !env.DATABASE_URL) {
      // Otherwise the daily budget would live in memory and reset on every restart.
      ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required in production" });
    }
    if (prod && isPgliteUrl(env.DATABASE_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "pglite is for local dev only",
      });
    }
    if (prod && env.QLOO_FIXTURE_DIR) {
      // Fixture answers are not real Qloo data and must never reach real users (CLAUDE.md rule 3).
      ctx.addIssue({
        code: "custom",
        path: ["QLOO_FIXTURE_DIR"],
        message: "not allowed in production",
      });
    }
    if (env.QLOO_BUDGET_RESERVE > env.DAILY_QLOO_CALL_BUDGET) {
      ctx.addIssue({
        code: "custom",
        path: ["QLOO_BUDGET_RESERVE"],
        message: "must not exceed DAILY_QLOO_CALL_BUDGET",
      });
    }
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
