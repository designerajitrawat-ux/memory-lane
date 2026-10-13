import { z } from "zod";
import type { QlooToolName } from "@memory-lane/shared";

// Strict mirrors of the harness input schemas (qloo_capabilities, contract 1.0.0). The harness checks
// the credential before validating args, so we validate here. Strings are also length-capped.
const text = z.string().trim().min(1).max(200);
const list = z.array(text).min(1).max(10);
const limit = z.number().int().min(1).max(20);
const operator = z.enum(["union", "intersection"]);
// Audience only as an age band or generation (docs/07: birth year only as a decade/age band), never a
// description of the person. Revisit after Phase 0 shows which phrases Qloo maps well.
const demographic = z
  .string()
  .trim()
  .regex(
    /^(?:(?:(?:men|women|people|adults)\s+)?(?:aged\s+)?\d{2}\s*(?:-\s*\d{2}|\+)|older adults|seniors|baby boomers|silent generation|gen x|millennials)$/i,
  );

const insightTypes = [
  "artist",
  "book",
  "brand",
  "movie",
  "person",
  "place",
  "podcast",
  "tv_show",
  "videogame",
] as const;
const InsightType = z.enum(insightTypes);
const EntityType = z.enum([...insightTypes, "locality", "actor", "album", "author", "director"]);

export const TOOL_ARG_SCHEMAS = {
  qloo_describe: z.strictObject({ entity: text, type: EntityType.optional() }),
  qloo_find_tags: z.strictObject({
    query: text,
    semantic: z.boolean().optional(),
    limit: limit.optional(),
  }),
  qloo_recommend: z.strictObject({
    target_type: InsightType,
    signals: list.optional(),
    signal_tags: list.optional(),
    signal_tags_operator: operator.optional(),
    signal_location: text.optional(),
    demographic: demographic.optional(),
    filter_location: text.optional(),
    include_tags: list.optional(),
    include_tags_operator: operator.optional(),
    exclude_tags: list.optional(),
    exclude_tags_operator: operator.optional(),
    explain: z.boolean().optional(),
    limit: limit.optional(),
  }),
  qloo_rank: z.strictObject({
    options: list,
    option_type: InsightType,
    signals: list.optional(),
    signal_location: text.optional(),
    demographic: demographic.optional(),
    include_tags: list.optional(),
    exclude_tags: list.optional(),
  }),
  qloo_where_popular: z.strictObject({
    entity: text,
    entity_type: EntityType.optional(),
    within: text,
    limit: limit.optional(),
  }),
  qloo_entity_tags: z.strictObject({
    entities: list,
    entity_type: EntityType.optional(),
    limit: limit.optional(),
  }),
  qloo_audience_demographics: z.strictObject({
    entity: text,
    entity_type: EntityType.optional(),
    limit: limit.optional(),
  }),
} satisfies Record<QlooToolName, z.ZodType>;

export type ToolArgs<T extends QlooToolName> = z.infer<(typeof TOOL_ARG_SCHEMAS)[T]>;

/** Location-like fields: only coarse regions ("Punjab, India") may pass, so digits are refused. */
export const LOCATION_FIELDS = new Set(["signal_location", "filter_location", "within"]);

/** Free-text concept fields (not entity names): postcodes and street addresses are refused here. */
export const FREE_TEXT_FIELDS = new Set(["query"]);

/** Fields that may carry Qloo identifiers (entity UUIDs, tag URNs) instead of names. */
export const ID_FIELDS = new Set([
  "signals",
  "options",
  "entities",
  "entity",
  "signal_tags",
  "include_tags",
  "exclude_tags",
]);
