import { z } from "zod";

/**
 * Qloo's own picture of an entity (an artist's photo, a film poster, a place), as Qloo serves it:
 * https://images.qloo.com/i/<file> only, with no user, port, query or other path. The web app shows it
 * through its image optimizer (same origin), and nothing is ever downloaded, stored or committed. Food
 * tags and unmatched names have none.
 */
export const QlooImageSchema = z
  .string()
  .max(300)
  .regex(/^https:\/\/images\.qloo\.com\/i\/[A-Za-z0-9][A-Za-z0-9._-]*$/, "Not a Qloo image URL.");

/** The image URL if it is one of Qloo's, else null (agent mappers and the UI use the same rule). */
export const qlooImageOrNull = (value: unknown): string | null => {
  const parsed = QlooImageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
