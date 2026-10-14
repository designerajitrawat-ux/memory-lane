import type { ProfileInput, Reaction } from "@memory-lane/shared";

/**
 * The three FICTIONAL demo personas (docs/11): different countries and cultures, so judges can see
 * Qloo's breadth without creating anything. Seeds are public cultural names only; the place seeds are
 * the ones that resolve well (Phase 0). The sample reactions for session 1 are by position in the
 * session template (opening song, film/TV, food, place, your choice, closing song) and show the
 * learning loop: a sing-along gets "more like this", an upset item never returns.
 */
export interface DemoPersona {
  key: string;
  input: ProfileInput;
  reactions: (Reaction | null)[];
}

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    key: "dorothy-us",
    input: {
      nickname: "Dorothy",
      birthYear: 1946,
      languages: ["English"],
      lifeStages: [
        { region: "Dayton, Ohio", fromYear: 1946, toYear: 1968 },
        { region: "Columbus, Ohio", fromYear: 1968, toYear: 2010 },
      ],
      favourites: [
        { domain: "music", text: "Patsy Cline" },
        { domain: "film", text: "The Sound of Music" },
        { domain: "music", text: "Elvis Presley" },
        { domain: "tv", text: "I Love Lucy" },
        { domain: "food", text: "Pot roast" },
      ],
      avoid: [{ text: "Unchained Melody" }, { text: "Vietnam War" }],
    },
    reactions: ["sang", "engaged", "neutral", "distressed", "engaged", "sang"],
  },
  {
    key: "harjeet-in",
    input: {
      nickname: "Harjeet",
      birthYear: 1950,
      languages: ["Punjabi", "Hindi", "English"],
      lifeStages: [
        { region: "Amritsar, Punjab, India", fromYear: 1950, toYear: 1975 },
        { region: "Delhi, India", fromYear: 1975, toYear: 2015 },
      ],
      favourites: [
        { domain: "music", text: "Mohammed Rafi" },
        { domain: "film", text: "Mughal-e-Azam" },
        { domain: "food", text: "Sarson da saag" },
        { domain: "place", text: "Sri Harmandir Sahib" },
      ],
      avoid: [{ text: "Partition memories" }, { text: "1984" }],
    },
    reactions: ["sang", "engaged", "engaged", "engaged", "neutral", "sang"],
  },
  {
    key: "margaret-uk",
    input: {
      nickname: "Margaret",
      birthYear: 1944,
      languages: ["English"],
      lifeStages: [
        { region: "Liverpool, England", fromYear: 1944, toYear: 1970 },
        { region: "Manchester, England", fromYear: 1970, toYear: 2012 },
      ],
      favourites: [
        { domain: "music", text: "Cilla Black" },
        { domain: "music", text: "The Beatles" },
        { domain: "tv", text: "Coronation Street" },
        { domain: "food", text: "Fish and chips" },
        { domain: "place", text: "The Blackpool Tower" },
      ],
      avoid: [{ text: "the Blitz / wartime bombing" }],
    },
    reactions: ["sang", "engaged", "neutral", "distressed", "engaged", "sang"],
  },
];

/**
 * Bump when the research or session logic changes what a persona should contain: the next start
 * builds the new version and removes the old one once the new one is complete.
 */
export const DEMO_VERSION = 5;

/** Every version of a persona's owner hash starts with this. */
export const demoOwnerPrefix = (key: string) => `demo:${key}`;

/** The owner hash a demo profile is stored under: no device token can ever produce it. */
export const demoOwnerHash = (key: string) => `${demoOwnerPrefix(key)}:v${DEMO_VERSION}`;
