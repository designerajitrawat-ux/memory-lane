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
  uniqueIndex,
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
    year: integer("year"), // from the chosen Qloo match (films, TV)
    description: text("description"), // Qloo's one line about the chosen match
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
    entityType: text("entity_type"), // raw Qloo type URN: urn:entity:artist, urn:tag:cuisine:qloo, …
    year: integer("year"),
    description: text("description"), // one line from Qloo to tell same-name matches apart
    evidenceId: uuid("evidence_id")
      .notNull()
      .references(() => qlooCalls.id),
  },
  (t) => [index("seed_candidates_seed_idx").on(t.seedId)],
);

/**
 * Stage 2 output (docs/05): one row per build; the newest version is shown. Items carry their Qloo
 * evidence ids; the rows go with the profile.
 */
export const tasteProfiles = pgTable(
  "taste_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    eraFrom: integer("era_from").notNull(),
    eraTo: integer("era_to").notNull(),
    partial: boolean("partial").notNull().default(false),
    items: jsonb("items").notNull(),
    notes: jsonb("notes").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("taste_profiles_profile_version_idx").on(t.profileId, t.version)],
);

/** Stage 3 sessions (docs/05): planned from a taste profile version; items carry their evidence. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: text("status").notNull().default("planned"), // planned | in_progress | done
    tasteProfileId: uuid("taste_profile_id").references(() => tasteProfiles.id, {
      onDelete: "set null",
    }),
    whatChanged: jsonb("what_changed").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_profile_number_idx").on(t.profileId, t.number),
    check("sessions_status_check", sql`${t.status} in ('planned', 'in_progress', 'done')`),
  ],
);

export const sessionItems = pgTable(
  "session_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind").notNull(), // song | film | tv | food | place
    domain: text("domain").notNull(),
    entityId: text("entity_id").notNull(),
    entityType: text("entity_type"),
    name: text("name").notNull(),
    year: integer("year"),
    why: text("why").notNull(),
    prompts: text("prompts").array().notNull(),
    minutes: integer("minutes").notNull(),
    link: jsonb("link").notNull(),
    altLink: jsonb("alt_link"),
    evidenceIds: text("evidence_ids").array().notNull(),
    reaction: text("reaction"), // sang | engaged | neutral | distressed
    note: text("note"), // the caregiver's own words; never sent to Qloo
    reactedAt: timestamp("reacted_at", { withTimezone: true }),
  },
  (t) => [
    index("session_items_session_idx").on(t.sessionId),
    check(
      "session_items_reaction_check",
      sql`${t.reaction} is null or ${t.reaction} in ('sang', 'engaged', 'neutral', 'distressed')`,
    ),
    check("session_items_evidence_check", sql`cardinality(${t.evidenceIds}) > 0`),
  ],
);
