import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// docs/04 §4. Phase 2 tables: Qloo cache, evidence log and the daily budget. Profiles, sessions etc.
// arrive in Phase 3.

export const qlooCache = pgTable("qloo_cache", {
  key: text("key").primaryKey(), // sha256(tool + canonical JSON args)
  tool: text("tool").notNull(),
  args: jsonb("args").notNull(),
  envelope: jsonb("envelope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never (demo personas)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qlooCalls = pgTable("qloo_calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  tool: text("tool").notNull(),
  argsChecked: jsonb("args_checked").notNull(), // args exactly as sent, after passing the PII guard
  status: text("status").notNull(),
  summary: text("summary"),
  resultCount: integer("result_count").notNull().default(0),
  resultsDigest: jsonb("results_digest").notNull().default([]),
  cached: boolean("cached").notNull().default(false),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const budget = pgTable("budget", {
  day: date("day").primaryKey(), // UTC day
  qlooCalls: integer("qloo_calls").notNull().default(0),
  llmTokens: bigint("llm_tokens", { mode: "number" }).notNull().default(0),
});
