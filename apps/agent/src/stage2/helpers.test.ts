import { describe, expect, it } from "vitest";
import type { TasteItem } from "@memory-lane/shared";
import { avoidMatcher } from "./avoid";
import { onlyPlaceWords, similarNames } from "./build";
import { bumpDistance, eraFor, eraPlacement, mentionedYears, yearFits } from "./era";
import { captionAllowed, promptAllowed } from "./language";
import { validateTasteItems } from "./validators";

describe("era", () => {
  const era = eraFor(1950, 2026);

  it("spans youth to mid-life, with the reminiscence bump inside", () => {
    expect(era).toEqual({ from: 1955, to: 1995, bumpFrom: 1960, bumpTo: 1980 });
    expect(yearFits(1960, era)).toBe(true);
    expect(yearFits(2015, era)).toBe(false);
    expect(yearFits(null, era)).toBe(false);
    expect(bumpDistance(1970, era)).toBe(0);
    expect(bumpDistance(1990, era)).toBe(10);
  });

  it("reads years and decades from descriptions", () => {
    expect(mentionedYears("famous in 1950s–60s Hindi cinema")).toEqual([1950, 1960]);
    expect(mentionedYears("Kishore Kumar (1929–1987)")).toEqual([1929, 1987]);
    expect(mentionedYears("from the late 1980s through the 2000s")).toEqual([1980, 2000]);
    expect(mentionedYears(null)).toEqual([]);
  });

  it("places singers by the years Qloo's description mentions", () => {
    expect(eraPlacement("associated with 1950s–60s Hindi cinema", era)).toBe("fits");
    expect(eraPlacement("Kishore Kumar (1929–1987) … hits across the 1950s–1980s", era)).toBe(
      "fits",
    );
    expect(eraPlacement("a soulful, versatile voice", era)).toBe("unknown");
    // Live check: these ranked above Lata Mangeshkar before; their centre is past the bump.
    expect(eraPlacement("a defining sound from the late 1980s through the 2000s", era)).toBe(
      "later",
    );
    expect(eraPlacement("popular in the 1980s and 1990s", era)).toBe("later");
  });
});

describe("avoidMatcher", () => {
  const avoided = avoidMatcher(["Vietnam War", "Partition memories", "1984", "Unchained Melody"]);

  it("matches phrases and meaningful words in names and descriptions", () => {
    expect(avoided("Example Film", "A drama set during the Vietnam war.")).toBe(true);
    expect(avoided("A Story of Partition", null)).toBe(true);
    expect(avoided("Example Film", "Released in 1984.")).toBe(true);
    expect(avoided("Unchained Melody", null)).toBe(true);
  });

  it("brings the related words of well-known painful topics", () => {
    // Wagah's description never says "Partition" (live check).
    expect(avoided("Example Border Post", "A daily ceremony at the India Pakistan border.")).toBe(
      true,
    );
    expect(
      avoidMatcher(["the Blitz / wartime bombing"])("Example", "An air raid shelter tour."),
    ).toBe(true);
    expect(avoided("Golden Temple", "Sikh shrine in Amritsar.")).toBe(false);
  });

  it("ignores filler words and unrelated text", () => {
    expect(avoided("Sweet Memories", "A gentle film about memories of home.")).toBe(false);
    expect(avoided("Example Singer", "A playback singer of the 1960s.")).toBe(false);
    expect(avoidMatcher([])("Anything", "at all")).toBe(false);
  });
});

describe("language policy", () => {
  it("blocks claims about the person and about treatment", () => {
    expect(captionAllowed("People who enjoy Example often also enjoy Other.")).toBe(true);
    expect(captionAllowed("She loved this song.")).toBe(false);
    expect(captionAllowed("He will enjoy this film.")).toBe(false);
    expect(captionAllowed("Music therapy for dementia patients.")).toBe(false);
  });

  it("keeps prompts as gentle invitations, not memory tests", () => {
    expect(promptAllowed("Tell me about the first film you saw at the cinema.")).toBe(true);
    expect(promptAllowed("Do you remember who sang this?")).toBe(false);
    expect(promptAllowed("What year was this released?")).toBe(false);
  });
});

describe("validateTasteItems (the last gate)", () => {
  const item = (over: Partial<TasteItem>): TasteItem => ({
    entityId: "e1",
    domain: "music",
    entityType: "urn:entity:artist",
    typeLabel: "singer or band",
    name: "Example Singer",
    year: null,
    description: null,
    caption: "People who enjoy Example often also enjoy Example Singer.",
    source: "qloo",
    becauseOf: ["Example"],
    evidenceIds: ["ev1"],
    ...over,
  });
  const evidence = [
    {
      id: "ev1",
      tool: "qloo_recommend",
      status: "ok",
      digest: [{ id: "e1", name: "Example Singer" }],
    },
    { id: "ev2", tool: "qloo_describe", status: "needs_input", digest: [] },
    { id: "ev3", tool: "qloo_recommend", status: "error", digest: [{ id: "e1" }] },
  ];

  it("drops anything not in its own Qloo evidence, avoided, or wrongly worded", () => {
    const { kept, dropped } = validateTasteItems(
      [
        item({}),
        item({ entityId: "invented", name: "Invented By An LLM" }), // not in the evidence
        item({ evidenceIds: ["ev3"] }), // evidence was an error
        item({ evidenceIds: ["missing"] }),
        item({ name: "Song of the Vietnam War" }),
        item({ caption: "She loved this song." }),
        item({ source: "favourite", entityId: "picked", evidenceIds: ["ev2"] }), // chosen in Stage 1
      ],
      evidence,
      avoidMatcher(["Vietnam War"]),
    );
    expect(kept.map((i) => i.entityId)).toEqual(["e1", "picked"]);
    expect(dropped.map((d) => d.reason)).toEqual([
      "no_evidence",
      "no_evidence",
      "no_evidence",
      "avoid",
      "language",
    ]);
  });
});

describe("similarNames", () => {
  it("treats near-identical dish names as one dish", () => {
    expect(
      similarNames("Amritsari Chur Chur Naan And Cholle", "Chur Chur Naan With Amritsari Chole"),
    ).toBe(true);
    // Kulcha and naan are one bread in Qloo's Amritsar tags; a dish "with" more is still that dish.
    expect(similarNames("Amritsari Naan", "Amritsari Chur Chur Naan And Cholle")).toBe(true);
    expect(similarNames("Amritsar Kulcha", "Amritsari Naan")).toBe(true);
    expect(similarNames("Amritsar Kulcha", "Amritsari Kulcha And Chole")).toBe(true);
    expect(similarNames("Sarson Da Saag", "Saag")).toBe(true);
    expect(similarNames("Fish And Chips", "Fish Pie")).toBe(false);
    expect(similarNames("Punjabi Paneer", "Amritsari Naan")).toBe(false);
  });
});

describe("similarNames across wordings", () => {
  it("ignores generic food words and treats British as English", () => {
    expect(similarNames("Diner Food", "Diner Fare")).toBe(true);
    expect(similarNames("Diner", "Diner Food")).toBe(true);
    expect(similarNames("English Pub Food", "British Pub Food")).toBe(true);
    expect(similarNames("English Pub Food", "British Bar Food")).toBe(false);
  });
});

describe("similarNames when one name adds a word", () => {
  it("merges a name with the same name plus one word", () => {
    expect(similarNames("Diner", "American Diner Food")).toBe(true);
    expect(similarNames("Pizza", "Dayton Style Pizza With Extra Cheese")).toBe(false);
  });
});

describe("onlyPlaceWords", () => {
  const places = ["amritsar", "punjab", "india"];
  it("spots food tags that only name the place or its people", () => {
    expect(onlyPlaceWords("Punjabi", places)).toBe(true);
    expect(onlyPlaceWords("Panjabi", places)).toBe(true);
    expect(onlyPlaceWords("Authentic Punjabi Food", places)).toBe(true);
    expect(onlyPlaceWords("British Food", ["liverpool", "england"])).toBe(true);
    expect(onlyPlaceWords("Lancashire Cuisine", ["liverpool", "england"])).toBe(true);
    expect(onlyPlaceWords("Ohio Comfort Food", ["dayton", "ohio"])).toBe(true);
  });
  it("keeps named dishes", () => {
    expect(onlyPlaceWords("Amritsari Naan", places)).toBe(false);
    expect(onlyPlaceWords("Punjabi Paneer", places)).toBe(false);
    expect(onlyPlaceWords("Buckeye", ["dayton", "ohio"])).toBe(false);
    expect(onlyPlaceWords("Dayton Style Pizza", ["dayton", "ohio"])).toBe(false);
  });
});

describe("avoidMatcher precision", () => {
  it("needs every word of a longer entry, so common words don't block everything", () => {
    const avoided = avoidMatcher(["Unchained Melody", "U2"]);
    expect(avoided("Example Singer", "Known for a soaring melody.")).toBe(false);
    expect(avoided("Example Singer", "Famous for Unchained Melody.")).toBe(true);
    expect(avoided("U2", null)).toBe(true); // two letters are enough (review W3a)
    expect(avoided("Ultravox", null)).toBe(false);
  });
});
