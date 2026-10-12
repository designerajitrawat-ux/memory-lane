import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// docs/04 §4. Phase 2: Qloo cache, evidence log, daily budget. Phase 3: profiles, seeds, avoid-list.
// Sessions, reactions and taste profiles arrive in later phases.

export const qlooCache = pgTable("qloo_cache", {
  key: text("key").primaryKey(), // sha256(tool + canonical JSON args)
  tool: text("tool").notNull(),
  args: jsonb("args").notNull(),
  envelope: jsonb("envelope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = never (demo personas)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const qlooCalls = pgTable(
  "qloo_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The profile the call was made for; deleting the profile deletes its call records (docs/07 §2.8).
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "cascade" }),
    tool: text("tool").notNull(),
    argsChecked: jsonb("args_checked").notNull(), // args exactly as sent, after passing the PII guard
    status: text("status").notNull(),
    summary: text("summary"),
    resultCount: integer("result_count").notNull().default(0),
    resultsDigest: jsonb("results_digest").notNull().default([]),
    cached: boolean("cached").notNull().default(false),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("qloo_calls_profile_idx").on(t.profileId)],
);

export const budget = pgTable("budget", {
  day: date("day").primaryKey(), // UTC day
  qlooCalls: integer("qloo_calls").notNull().default(0),
  llmTokens: bigint("llm_tokens", { mode: "number" }).notNull().default(0),
  profilesCreated: integer("profiles_created").notNull().default(0), // global daily cap on new profiles
});

export interface LifeStageRow {
  region: string;
  fromYear: number;
  toYear: number;
}

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // sha256 of the owner token; the token itself lives only on the caregiver's device.
    ownerTokenHash: text("owner_token_hash").notNull(),
    nickname: text("nickname"), // never sent to Qloo or the AI
    birthYear: integer("birth_year").notNull(),
    languages: text("languages").array().notNull(),
    lifeStages: jsonb("life_stages").$type<LifeStageRow[]>().notNull(),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Bumped when the owner opens or lists it; idle non-demo profiles are purged (docs/07 §2.8).
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("profiles_owner_idx").on(t.ownerTokenHash)],
);

export const seeds = pgTable(
  "seeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    rawText: text("raw_text").notNull(),
    domain: text("domain").notNull(),
    qlooEntityId: text("qloo_entity_id"),
    qlooEntityType: text("qloo_entity_type"),
    displayName: text("display_name"),
    status: text("status").notNull().default("pending"), // pending | needs_input | confirmed | rejected | unresolved
    note: text("note"), // SeedNote: why it wasn't matched / couldn't be checked; fixed text in the UI
    source: text("source").notNull().default("caregiver"), // caregiver | learned
    evidenceId: uuid("evidence_id").references(() => qlooCalls.id),
  },
  (t) => [
    index("seeds_profile_idx").on(t.profileId),
    check(
      "seeds_status_check",
      sql`${t.status} in ('pending', 'needs_input', 'confirmed', 'rejected', 'unresolved')`,
    ),
    check(
      "seeds_note_check",
      sql`${t.note} is null or ${t.note} in ('not_found', 'no_clear_match', 'personal_info', 'invalid', 'lookup_failed')`,
    ),
    // Rule 2 in the database too: a confirmed seed always points at its Qloo evidence.
    check(
      "seeds_confirmed_evidence_check",
      sql`${t.status} <> 'confirmed' or (${t.evidenceId} is not null and ${t.qlooEntityId} is not null)`,
    ),
  ],
);

export const avoidItems = pgTable(
  "avoid_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    qlooEntityId: text("qloo_entity_id"),
    reason: text("reason"), // stays in our DB, never sent to Qloo
    source: text("source").notNull().default("caregiver"),
  },
  (t) => [index("avoid_items_profile_idx").on(t.profileId)],
);

/** Qloo matches found for a seed (Stage 1). Confirm accepts only these, so every seed has evidence. */
export const seedCandidates = pgTable(
  "seed_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seedId: uuid("seed_id")
      .notNull()
      .references(() => seeds.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    entityId: text("entity_id").notNull(),
    name: text("name").notNull(),
    entityType: text("entity_type"),
    year: integer("year"),
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => qlooCalls.id),
  },
  (t) => [index("seed_candidates_seed_idx").on(t.seedId)],
);
