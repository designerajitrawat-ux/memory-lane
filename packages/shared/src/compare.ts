import { z } from "zod";
import { SessionItemKindSchema } from "./session";

/**
 * "With vs without Qloo" (docs/01 US7, docs/06 screen 9): the same model asked for a session with no
 * tools, next to Memory Lane's Qloo-grounded session, with the differences counted in code.
 */
export const CompareItemSchema = z.object({
  kind: SessionItemKindSchema,
  name: z.string(),
  year: z.number().int().nullable(),
  why: z.string(),
  /** Qloo call records behind it (always 0 for the generic plan). */
  evidence: z.number().int(),
  /** A film, show or song dated outside the person's years. */
  outsideYears: z.boolean(),
  /** It touches the things to avoid (name or reason). */
  avoided: z.boolean(),
  /** Other demo people whose plan of the same kind also has it ("greatest hits"). */
  sharedWith: z.array(z.string()),
  /** One of the caregiver's own favourites or places, handed back rather than found. */
  fromFavourites: z.boolean().default(false),
  /** What it matched in the caregiver's typing ("By Patsy Cline, one of their favourites"). */
  matched: z.string().nullable().default(null),
  /** Memory Lane's items: how the item got into the profile ("proposed" = suggested by the AI, ranked by Qloo). */
  source: z.enum(["favourite", "qloo", "proposed", "learned"]).nullable().default(null),
  /** The reason used wording Memory Lane's checks block (claims about the person, memory tests, medical words); it is not shown. */
  wordingBlocked: z.boolean().default(false),
});

export const ComparePlanSchema = z.object({
  items: z.array(CompareItemSchema),
  withEvidence: z.number().int(),
  outsideYears: z.number().int(),
  avoided: z.number().int(),
  shared: z.number().int(),
  /** Items beyond what the caregiver typed: what each side actually found. */
  beyondFavourites: z.number().int().default(0),
  /** Reasons whose wording Memory Lane's checks block. */
  wordingBlocked: z.number().int().default(0),
});

export const CompareResponseSchema = z.object({
  /** ready, or why the generic side isn't there (no AI key, today's AI budget used, a failure). */
  state: z.enum(["ready", "off", "budget", "limit", "refused", "failed"]),
  model: z.string().nullable(),
  era: z.object({ from: z.number().int(), to: z.number().int() }),
  generic: ComparePlanSchema.nullable(),
  memoryLane: ComparePlanSchema.nullable(),
  /** The session Memory Lane's side comes from (its first: made from the same facts, before any reactions). */
  sessionId: z.string().nullable(),
  sessionNumber: z.number().int().nullable().default(null),
  /** Whose plan this is (shown as the page's subtitle), and whether it is a public demo. */
  nickname: z.string().nullable().default(null),
  demo: z.boolean().default(false),
  /** Who the "shared" counts compare against (demo profiles only, and only where both sides could be compared). */
  comparedWith: z.array(z.string()),
});

export type CompareItem = z.infer<typeof CompareItemSchema>;
export type ComparePlan = z.infer<typeof ComparePlanSchema>;
export type CompareResponse = z.infer<typeof CompareResponseSchema>;
