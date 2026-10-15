import { z } from "zod";
import { QlooImageSchema } from "./image";
import { personalDetailProblem } from "./pii";
import { TasteDomainSchema } from "./taste";

/**
 * Stage 3 sessions and reactions (docs/05 §2, docs/06 screens 6–8). A session is 5–6 items from the
 * Life Taste Profile, each with a reason, gentle prompts and a link built in code; the caregiver logs
 * how each one landed.
 */
export const ReactionSchema = z.enum(["sang", "engaged", "neutral", "distressed"]);
export const SessionItemKindSchema = z.enum(["song", "film", "tv", "food", "place"]);
export const SessionStatusSchema = z.enum(["planned", "in_progress", "done"]);

/** Search pages built in code (YouTube, Spotify, Google Maps); only https links are shown. */
export const SessionLinkSchema = z.object({
  url: z.url({
    protocol: /^https$/,
    hostname: /^(?:www\.youtube\.com|open\.spotify\.com|www\.google\.com)$/,
  }),
  label: z.string(),
});

export const SessionItemSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  kind: SessionItemKindSchema,
  domain: TasteDomainSchema,
  /** Qloo entity id or tag URN (from the taste profile). */
  entityId: z.string(),
  entityType: z.string().nullable(),
  name: z.string(),
  year: z.number().int().nullable(),
  /** Why it is in the session, aggregate wording. */
  why: z.string(),
  /** 2–3 open, gentle invitations; never memory tests. */
  prompts: z.array(z.string()).min(1).max(3),
  minutes: z.number().int().positive(),
  link: SessionLinkSchema,
  altLink: SessionLinkSchema.nullable(),
  evidenceIds: z.array(z.string()).min(1),
  /** Qloo's picture of it, to look at together; dishes have none. */
  image: QlooImageSchema.nullable().optional(),
  reaction: ReactionSchema.nullable(),
  /** The caregiver's own note; stays in Memory Lane (never sent to Qloo). */
  note: z.string().nullable(),
});

export const SessionSchema = z.object({
  id: z.string(),
  profileId: z.string(),
  number: z.number().int().positive(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  totalMinutes: z.number().int(),
  items: z.array(SessionItemSchema),
  /** What the agent changed compared with the previous session (Stage 4); empty for session 1. */
  whatChanged: z.array(z.string()),
});

export const SessionSummarySchema = z.object({
  id: z.string(),
  number: z.number().int(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  itemCount: z.number().int(),
  reacted: z.number().int(),
});

export const SessionResponseSchema = z.object({
  session: SessionSchema,
  /** A public demo persona's session: it can be played, but reactions aren't saved. */
  readOnly: z.boolean().default(false),
});
export const SessionListResponseSchema = z.object({ sessions: z.array(SessionSummarySchema) });
/**
 * POST /api/demo-profiles/:id/try → session 1 of a private copy of a demo persona, on this device
 * (a new owner token when the device had none).
 */
export const TryDemoResponseSchema = z.object({
  session: SessionSchema,
  ownerToken: z.string().optional(),
});

export const ReactionRequestSchema = z.object({
  value: ReactionSchema.nullable(),
  /** Stays in Memory Lane; the same personal-detail rules as the profile apply (docs/07 §2.9). */
  note: z
    .string()
    .trim()
    .max(300, "Please keep the note under 300 characters.")
    .superRefine((s, ctx) => {
      const problem = personalDetailProblem(s);
      if (problem) ctx.addIssue({ code: "custom", message: problem });
    })
    .optional(),
});

export type Reaction = z.infer<typeof ReactionSchema>;
export type SessionItemKind = z.infer<typeof SessionItemKindSchema>;
export type SessionItem = z.infer<typeof SessionItemSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type ReactionRequest = z.infer<typeof ReactionRequestSchema>;
