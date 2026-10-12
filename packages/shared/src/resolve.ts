import { z } from "zod";
import { SeedNoteSchema, SeedStatusSchema, type SeedNote } from "./profile";

/**
 * Stage 1, seed resolution (docs/05 §2, docs/06 screen 4). The agent looks each pending favourite up
 * in Qloo and stores the candidates; the caregiver picks one (or none). Only candidates the agent found
 * can be confirmed, so every confirmed seed carries Qloo evidence.
 */
export const CandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().nullable(),
  year: z.number().int().nullable(),
});

export const SeedResolutionSchema = z.object({
  seedId: z.string(),
  rawText: z.string(),
  status: SeedStatusSchema,
  candidates: z.array(CandidateSchema),
  note: SeedNoteSchema.nullable(),
  /** Fixed, human text for `note` (never harness output). */
  message: z.string().nullable(),
});

/** The one place the note texts live, so the confirm screen, the stream and reloads say the same. */
export const SEED_NOTE_MESSAGES: Record<SeedNote, string> = {
  not_found: "Qloo couldn't find this one, so it won't be used.",
  no_clear_match: "Qloo couldn't find a clear match, so it won't be used.",
  personal_info: "This looks like personal information, so it wasn't sent to Qloo.",
  invalid: "This one couldn't be looked up, so it won't be used.",
  lookup_failed: "Qloo couldn't answer for this one just now. You can try again.",
};

/** Why a resolve run stopped early, so the UI can show the right honest banner. */
export const ResolveProblemSchema = z.enum(["qloo_not_connected", "quota", "unavailable"]);

export const ResolveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step"), message: z.string() }),
  z.object({ type: z.literal("result"), message: z.string(), data: SeedResolutionSchema }),
  z.object({ type: z.literal("error"), message: z.string(), problem: ResolveProblemSchema }),
  z.object({ type: z.literal("done"), message: z.string(), data: z.array(SeedResolutionSchema) }),
]);

export const ConfirmRequestSchema = z.object({
  decisions: z
    .array(z.object({ seedId: z.uuid(), candidateId: z.uuid().nullable() }))
    .min(1)
    .max(10),
});

export type Candidate = z.infer<typeof CandidateSchema>;
export type SeedResolution = z.infer<typeof SeedResolutionSchema>;
export type ResolveProblem = z.infer<typeof ResolveProblemSchema>;
export type ResolveEvent = z.infer<typeof ResolveEventSchema>;
export type ConfirmRequest = z.infer<typeof ConfirmRequestSchema>;
