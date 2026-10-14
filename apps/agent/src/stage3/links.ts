import type { SessionItemKind } from "@memory-lane/shared";

/**
 * Listen/watch links are built in code, never by the LLM (docs/05 §2): search pages on YouTube,
 * Spotify and Google Maps, so Memory Lane never hosts or reproduces media (CLAUDE.md rule 8). The
 * search terms are public cultural names from Qloo (plus a decade or a town), never anything about the
 * person. Labels say where the link goes.
 */
export interface Link {
  url: string;
  label: string;
}

/** What a link search may add to the name: the decade a singer is remembered for, a place's town. */
export interface LinkContext {
  year: number | null;
  /** Singers: the decade to search ("1960s"), from Qloo's description and the person's era. */
  decade?: string | null;
  /** Places: the town Qloo placed it in. */
  locality?: string | null;
  /** Food: a cuisine label ("Punjabi") rather than one dish. */
  cuisine?: boolean;
}

// Each allowed host with the search paths links may use (security review S2: allowed hosts also
// serve open redirects, e.g. /url and /redirect, so the path is checked too).
const ALLOWED: Record<string, readonly string[]> = {
  "www.youtube.com": ["/results"],
  "open.spotify.com": ["/search/"],
  "www.google.com": ["/maps/search/"],
};
export const LINK_HOSTS = new Set(Object.keys(ALLOWED));

const youtube = (q: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;

export function linksFor(
  kind: SessionItemKind,
  name: string,
  context: LinkContext = { year: null },
): { link: Link; altLink: Link | null } {
  switch (kind) {
    case "song":
      return {
        link: {
          url: youtube(`${name}${context.decade ? ` ${context.decade}` : ""} songs`),
          label: "Listen on YouTube",
        },
        altLink: {
          url: `https://open.spotify.com/search/${encodeURIComponent(name)}`,
          label: "Listen on Spotify",
        },
      };
    case "film":
      return {
        link: {
          url: youtube(`${name}${context.year ? ` ${context.year}` : ""} film songs and scenes`),
          label: "Watch clips on YouTube",
        },
        altLink: null,
      };
    case "tv":
      return {
        link: {
          url: youtube(`${name}${context.year ? ` ${context.year}` : ""} theme tune`),
          label: "Hear the theme tune on YouTube",
        },
        altLink: null,
      };
    case "food":
      return context.cuisine
        ? {
            link: { url: youtube(`${name} recipes`), label: "See it cooked on YouTube" },
            altLink: null,
          }
        : {
            link: { url: youtube(`how to make ${name}`), label: "Watch it being made on YouTube" },
            altLink: null,
          };
    case "place":
      return {
        link: {
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            context.locality ? `${name}, ${context.locality}` : name,
          )}`,
          label: "See it on Google Maps",
        },
        altLink: null,
      };
  }
}

/** Only https search pages on the hosts above may be shown (validator). */
export function linkAllowed(link: Link | null): boolean {
  if (!link) return true;
  try {
    const u = new URL(link.url);
    const paths = ALLOWED[u.host];
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !!paths &&
      paths.some((p) => u.pathname === p || (p.endsWith("/") && u.pathname.startsWith(p)))
    );
  } catch {
    return false;
  }
}
