import { z } from "zod";
import { ResolveProblemSchema } from "./resolve";

/**
 * Stage 2, the Life Taste Profile (docs/05 §2, docs/06 screen 5): cultural items across four domains,
 * built from the caregiver's confirmed favourites with Qloo. Every item carries Qloo evidence ids;
 * code validators drop anything without them (CLAUDE.md rule 2).
 */
export const TasteDomainSchema = z.enum(["music", "film_tv", "food", "places"]);

export const TasteItemSchema = z.object({
  /** Qloo entity id or tag URN. */
  entityId: z.string(),
  domain: TasteDomainSchema,
  /** Raw Qloo type URN (urn:entity:artist, urn:tag:cuisine:qloo). */
  entityType: z.string().nullable(),
  /** Plain-language type ("film", "dish"). */
  typeLabel: z.string().nullable(),
  name: z.string(),
  year: z.number().int().nullable(),
  /** One line from Qloo. */
  description: z.string().nullable(),
  /** Why it is here, in aggregate wording ("People who enjoy X often also enjoy Y"). */
  caption: z.string(),
  /**
   * "favourite" = confirmed by the caregiver; "qloo" = found by Qloo from the favourites; "learned" =
   * found by Qloo from what landed well in a session (Stage 4).
   */
  source: z.enum(["favourite", "qloo", "learned"]),
  /** Names of the favourites that led Qloo to it (Qloo's own explanation), if any. */
  becauseOf: z.array(z.string()),
  evidenceIds: z.array(z.string()).min(1),
});

export const TasteProfileSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  /** Years whose films and TV fit (youth to mid-life); used to keep results in their era. */
  era: z.object({ from: z.number().int(), to: z.number().int() }),
  /** Some domains couldn't be researched this time (quota, outage); the notes say which. */
  partial: z.boolean(),
  items: z.array(TasteItemSchema),
  /** Fixed, human text: what was filtered or couldn't be found. Never harness output. */
  notes: z.array(z.string()),
});

export const TasteEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), message: z.string() }),
  z.object({ type: z.literal("error"), message: z.string(), problem: ResolveProblemSchema }),
  z.object({ type: z.literal("done"), message: z.string(), data: TasteProfileSchema.nullable() }),
]);

/** GET /api/profiles/:id/taste-profile → the latest profile, or null before the first build. */
export const TasteProfileResponseSchema = z.object({ tasteProfile: TasteProfileSchema.nullable() });

/** GET /api/evidence/:id → one Qloo call record, as stored (args already passed the PII guard). */
export const EvidenceViewSchema = z.object({
  id: z.string(),
  tool: z.string(),
  args: z.unknown(),
  status: z.string(),
  resultCount: z.number().int(),
  cached: z.boolean(),
  createdAt: z.string(),
});

export type TasteDomain = z.infer<typeof TasteDomainSchema>;
export type TasteItem = z.infer<typeof TasteItemSchema>;
export type TasteProfile = z.infer<typeof TasteProfileSchema>;
export type TasteEvent = z.infer<typeof TasteEventSchema>;
export type EvidenceView = z.infer<typeof EvidenceViewSchema>;
