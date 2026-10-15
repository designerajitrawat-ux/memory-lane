import { qlooImageOrNull } from "@memory-lane/shared";

/**
 * Qloo's picture of an entity from its result `properties` (`properties.image.url`), only when it is
 * one of Qloo's own image files (https://images.qloo.com/i/…); anything else is dropped. The URL is
 * passed along as Qloo gave it; the image itself is never fetched or stored here.
 */
export function imageFrom(properties: unknown): string | null {
  if (!properties || typeof properties !== "object") return null;
  const image = (properties as Record<string, unknown>).image;
  if (!image || typeof image !== "object") return null;
  return qlooImageOrNull((image as Record<string, unknown>).url);
}
