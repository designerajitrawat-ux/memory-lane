import { z } from "zod";
import { TasteDomainSchema } from "./taste";

/**
 * Stage 3 sessions and reactions (docs/05 §2, docs/06 screens 6–8). A session is 5–6 items from the
 * Life Taste Profile, each with a reason, gentle prompts and a link built in code; the caregiver logs
 * how each one landed.
 */
export const ReactionSchema = z.enum(["sang", "engaged", "neutral", "distressed"]);
export const SessionItemKindSchema = z.enum(["song", "film", "tv", "food", "place"]);
export const SessionStatusSchema = z.enum(["planned", "in_progress", "done"]);

export const SessionLinkSchema = z.object({ url: z.string(), label: z.string() });

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

export const ReactionRequestSchema = z.object({
  value: ReactionSchema.nullable(),
  note: z.string().trim().max(300).optional(),
});

export type Reaction = z.infer<typeof ReactionSchema>;
export type SessionItemKind = z.infer<typeof SessionItemKindSchema>;
export type SessionItem = z.infer<typeof SessionItemSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type SessionSummary = z.infer<typeof SessionSummarySchema>;
export type ReactionRequest = z.infer<typeof ReactionRequestSchema>;
