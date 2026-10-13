import type { SessionItemKind } from "@memory-lane/shared";

/**
 * Listen/watch links are built in code, never by the LLM (docs/05 §2): search pages on YouTube,
 * Spotify and Google Maps, so Memory Lane never hosts or reproduces media (CLAUDE.md rule 8). The
 * search terms are public cultural names from Qloo, never anything about the person.
 */
export interface Link {
  url: string;
  label: string;
}

export const LINK_HOSTS = new Set(["www.youtube.com", "open.spotify.com", "www.google.com"]);

const youtube = (q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export function linksFor(
  kind: SessionItemKind,
  name: string,
  year: number | null,
): { link: Link; altLink: Link | null } {
  switch (kind) {
    case "song":
      return {
        link: { url: youtube(`${name} songs`), label: "Listen on YouTube" },
        altLink: {
          url: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
          label: "Listen on Spotify",
        },
      };
    case "film":
      return {
        link: {
          url: youtube(`${name}${year ? ` ${year}` : ""} film songs and scenes`),
          label: "Watch clips on YouTube",
        },
        altLink: null,
      };
    case "tv":
      return {
        link: { url: youtube(`${name} theme tune`), label: "Hear the theme tune" },
        altLink: null,
      };
    case "food":
      return {
        link: { url: youtube(`how to make ${name}`), label: "Watch it being made" },
        altLink: null,
      };
    case "place":
      return {
        link: {
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`,
          label: "See it on a map",
        },
        altLink: null,
      };
  }
}

/** Only search pages on the hosts above may be shown (validator). */
export function linkAllowed(link: Link | null): boolean {
  if (!link) return true;
  try {
    const u = new URL(link.url);
    return u.protocol === "https:" && LINK_HOSTS.has(u.host);
  } catch {
    return false;
  }
}
