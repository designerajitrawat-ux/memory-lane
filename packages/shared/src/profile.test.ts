import { describe, expect, it } from "vitest";
import { ProfileInputSchema, type ProfileInput } from "./profile";

const valid: ProfileInput = {
  nickname: "Harjeet",
  birthYear: 1950,
  languages: ["Punjabi", "Hindi"],
  lifeStages: [
    { region: "Amritsar, Punjab, India", fromYear: 1950, toYear: 1975 },
    { region: "Delhi, India", fromYear: 1975, toYear: 2015 },
  ],
  favourites: [
    { domain: "music", text: "Mohammed Rafi" },
    { domain: "film", text: "Mughal-e-Azam" },
  ],
  avoid: [{ text: "Partition memories" }],
};

const issues = (input: unknown) => {
  const r = ProfileInputSchema.safeParse(input);
  return r.success ? [] : [...new Set(r.error.issues.map((i) => i.path.join(".")))];
};

const messages = (input: unknown) => {
  const r = ProfileInputSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("ProfileInputSchema: same personal-data rules as the Qloo guard (security review W1)", () => {
  it("refuses health details anywhere, including the private 'why'", () => {
    expect(
      issues({
        ...valid,
        avoid: [{ text: "Hospital visits", reason: "Since his dementia diagnosis and stroke" }],
      }),
    ).toEqual(["avoid.0.reason"]);
    expect(issues({ ...valid, favourites: [{ domain: "other", text: "music therapy" }] })).toEqual([
      "favourites.0.text",
    ]);
  });

  it("refuses addresses written with any digits or in free text", () => {
    for (const region of ["１２ Elm Road, Leeds", "२२१ Baker Street"]) {
      expect(
        issues({ ...valid, lifeStages: [{ region, fromYear: 1950, toYear: 1960 }] }),
        region,
      ).toEqual(["lifeStages.0.region"]);
    }
    expect(issues({ ...valid, avoid: [{ text: "our house at 12 Elm Road LS6" }] })).toEqual([
      "avoid.0.text",
    ]);
    expect(issues({ ...valid, avoid: [{ text: "x", reason: "near Chandigarh 160017" }] })).toEqual([
      "avoid.0.reason",
    ]);
  });

  it("refuses disguised contact details", () => {
    expect(issues({ ...valid, avoid: [{ text: "call ９８７６５４３２１０" }] })).toEqual([
      "avoid.0.text",
    ]);
    expect(issues({ ...valid, avoid: [{ text: "son＠example.com" }] })).toEqual(["avoid.0.text"]);
    expect(issues({ ...valid, avoid: [{ text: "see example.com/dad" }] })).toEqual([
      "avoid.0.text",
    ]);
  });

  it("lets eras and titles through (UX review W2)", () => {
    for (const text of ["War years 1939-1945", "Partition 1947-1948", "Songs from 1960 - 1970"]) {
      expect(issues({ ...valid, avoid: [{ text }] }), text).toEqual([]);
    }
    expect(issues({ ...valid, favourites: [{ domain: "tv", text: "21 Jump Street" }] })).toEqual(
      [],
    );
  });

  it("keeps the nickname to a first name or family nickname", () => {
    expect(issues({ ...valid, nickname: "Nani Ma" })).toEqual([]);
    expect(issues({ ...valid, nickname: "Harjeet Singh Sandhu" })).toEqual(["nickname"]);
  });
});

describe("year messages are plain words (UX review C2)", () => {
  it("never shows raw validator text", () => {
    const cases = [Number.NaN, 1900, 2099, 1950.5].map((y) => ({
      ...valid,
      lifeStages: [{ region: "Pune", fromYear: y, toYear: y }],
    }));
    for (const input of cases) {
      for (const m of messages(input)) expect(m).not.toMatch(/Invalid input|expected|>=|<=/);
    }
  });
});

describe("ProfileInputSchema", () => {
  it("accepts a typical profile and drops an empty nickname", () => {
    expect(issues(valid)).toEqual([]);
    expect(ProfileInputSchema.parse({ ...valid, nickname: "" }).nickname).toBeUndefined();
  });

  it("keeps places coarse: no digits in a region", () => {
    expect(
      issues({
        ...valid,
        lifeStages: [{ region: "12 MG Road, Pune", fromYear: 1950, toYear: 1960 }],
      }),
    ).toEqual(["lifeStages.0.region"]);
  });

  it("checks year order and the birth year", () => {
    expect(
      issues({ ...valid, lifeStages: [{ region: "Pune", fromYear: 1970, toYear: 1960 }] }),
    ).toContain("lifeStages.0.toYear");
    expect(
      issues({ ...valid, lifeStages: [{ region: "Pune", fromYear: 1940, toYear: 1960 }] }),
    ).toContain("lifeStages.0.fromYear");
  });

  it("refuses contact details in free text", () => {
    expect(
      issues({ ...valid, favourites: [{ domain: "music", text: "call 98765 43210" }] }),
    ).toEqual(["favourites.0.text"]);
    expect(issues({ ...valid, avoid: [{ text: "x", reason: "mail me at a@b.co" }] })).toEqual([
      "avoid.0.reason",
    ]);
    expect(
      issues({ ...valid, favourites: [{ domain: "music", text: "https://example.org" }] }),
    ).toEqual(["favourites.0.text"]);
  });

  it("limits sizes and requires the essentials", () => {
    expect(issues({ ...valid, favourites: [] })).toEqual(["favourites"]);
    expect(issues({ ...valid, languages: [] })).toEqual(["languages"]);
    expect(issues({ ...valid, nickname: "x".repeat(41) })).toEqual(["nickname"]);
    expect(issues({ ...valid, nickname: "Dad <script>" })).toEqual(["nickname"]);
  });
});
