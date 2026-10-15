import { z } from "zod";

/**
 * Qloo's own picture of an entity (an artist's photo, a film poster, a place), as Qloo's API gives it:
 * https://images.qloo.com/i/<file> only, with no user, port, query or other path. Only the URL is kept
 * in our database; the web app shows the picture through Vercel's image optimizer (same origin), which
 * caches resized copies; nothing is committed. Food tags and unmatched names have none.
 */
export const QlooImageSchema = z
  .string()
  .max(300)
  .regex(/^https:\/\/images\.qloo\.com\/i\/[A-Za-z0-9][A-Za-z0-9._-]*$/, "Not a Qloo image URL.");

/** An item's picture in an API response: a bad value means no picture, never a failed page. */
export const QlooImageFieldSchema = QlooImageSchema.nullable().optional().catch(null);

/** A list of pictures (the demo picker's preview): anything that isn't one of Qloo's is left out. */
export const QlooImageListSchema = z
  .array(z.unknown())
  .default([])
  .transform((values) =>
    values.flatMap((v) => (QlooImageSchema.safeParse(v).success ? [v as string] : [])),
  );

/** The image URL if it is one of Qloo's, else null (agent mappers and the UI use the same rule). */
export const qlooImageOrNull = (value: unknown): string | null => {
  const parsed = QlooImageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};
