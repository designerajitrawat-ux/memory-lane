import { describe, expect, it } from "vitest";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import findTagsFixture from "../../test/fixtures/synthetic/qloo_find_tags.json";
import { parseEnvelope } from "../qloo/envelope";
import { typeLabel } from "./labels";
import { describeTypeFor, mapDescribe } from "./mapDescribe";
import { mapFindTags } from "./mapFindTags";

const describeEnv = (patch: Record<string, unknown> = {}) =>
  parseEnvelope({ ...describeFixture.structuredContent, ...patch }, "qloo_describe");

describe("mapDescribe", () => {
  it("offers the exact match plus same-name, same-type alternatives only", () => {
    const out = mapDescribe(describeEnv());
    expect(out).toEqual([
      {
        entityId: "00000000-0000-4000-8000-00000000000a",
        name: "Example Artist A",
        entityType: "urn:entity:artist",
        year: null,
        description: "Example singer known for example songs.",
        // Qloo's picture comes with the selected match's full record; alternatives have none.
        image: "https://images.qloo.com/i/00000000-0000-4000-8000-00000000000a-420x-auto.jpg",
      },
      {
        entityId: "00000000-0000-4000-8000-00000000000b",
        name: "Example Artist A",
        entityType: "urn:entity:artist",
        year: 1975, // from "(1975)" in the description
        description: "Example tribute act (1975) with the same name.",
      },
    ]);
  });

  it("offers every same-type alternative when the match isn't exact", () => {
    const outcome = describeFixture.structuredContent.resolution.outcomes[0];
    const out = mapDescribe(
      describeEnv({ resolution: { outcomes: [{ ...outcome, match: "fuzzy" }] } }),
    );
    expect(out.map((c) => c.entityId.slice(-1))).toEqual(["a", "b", "c"]); // not the book
  });

  it("takes the year from the selected entity's properties", () => {
    const outcome = describeFixture.structuredContent.resolution.outcomes[0];
    const out = mapDescribe(
      describeEnv({
        resolution: {
          outcomes: [
            {
              ...outcome,
              selected: { ...outcome?.selected, type: "urn:entity:movie" },
              alternatives: [],
            },
          ],
        },
        results: [
          {
            entity_id: "00000000-0000-4000-8000-00000000000a",
            name: "Example Artist A",
            properties: { release_year: 1960, description: "x".repeat(300) },
          },
        ],
      }),
    );
    expect(out[0]).toMatchObject({ year: 1960, entityType: "urn:entity:movie" });
  });

  it("falls back to results when there is no resolution block, capped at five", () => {
    const out = mapDescribe(
      describeEnv({
        resolution: undefined,
        interpretation: undefined,
        results: [
          {
            id: "1",
            name: "Film One",
            type: "urn:entity:movie",
            properties: { release_year: 1960 },
          },
          { entity_id: "2", title: "Film Two", release_date: "1957-03-01" },
          { name: "No id" },
          ...Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, name: `Extra ${i}` })),
        ],
      }),
    );
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ entityType: "urn:entity:movie", year: 1960 });
    expect(out[1]).toMatchObject({ name: "Film Two", year: 1957 });
  });

  it("asks Qloo for a type where the domain maps cleanly; food and other use tags", () => {
    expect(describeTypeFor("music")).toBe("artist");
    expect(describeTypeFor("tv")).toBe("tv_show");
    expect(describeTypeFor("food")).toBeUndefined();
  });
});

describe("mapFindTags", () => {
  const env = parseEnvelope(findTagsFixture.structuredContent, "qloo_find_tags");

  it("keeps one dish per name, preferring the cuisine tag, and drops non-food tags", () => {
    expect(mapFindTags(env, "food")).toEqual([
      {
        entityId: "urn:tag:cuisine:qloo:example_dish",
        name: "Example Dish",
        entityType: "urn:tag:cuisine:qloo",
        year: null,
        description: null,
      },
      expect.objectContaining({ name: "Example Dish Pizza" }),
    ]);
  });

  it("keeps Qloo's order and all tag kinds for other interests", () => {
    expect(mapFindTags(env, "other").map((c) => c.name)).toEqual([
      "Example Dish",
      "Example Dish Pizza",
      "Example Genre",
    ]);
  });
});

describe("typeLabel", () => {
  it("speaks plainly", () => {
    expect(typeLabel("urn:entity:movie")).toBe("film");
    expect(typeLabel("urn:entity:tv_show")).toBe("TV show");
    expect(typeLabel("urn:tag:specialty_dish:place")).toBe("dish");
    expect(typeLabel("urn:tag:genre:music")).toBe("genre");
    expect(typeLabel("artist")).toBe("artist"); // stored before type URNs were kept
    expect(typeLabel(null)).toBeNull();
  });
});

describe("mapDescribe for places", () => {
  it("offers every same-type alternative even on an exact match, with a short address", () => {
    const place = (id: string, name: string, description?: string) => ({
      id,
      name,
      type: "urn:entity:place",
      ...(description ? { description } : {}),
    });
    const out = mapDescribe(
      parseEnvelope(
        {
          ...describeFixture.structuredContent,
          resolution: {
            outcomes: [
              {
                match: "exact",
                selected: place("p1", "Example Temple"),
                alternatives: [place("p2", "Example Temple Old Town", "A temple in Example Town.")],
              },
            ],
          },
          results: [
            {
              entity_id: "p1",
              name: "Example Temple",
              properties: { address: "1 Example Road, Example City, Example Country" },
            },
          ],
        },
        "qloo_describe",
      ),
    );
    expect(out.map((c) => [c.name, c.description])).toEqual([
      ["Example Temple", "Example City, Example Country"],
      ["Example Temple Old Town", "A temple in Example Town."],
    ]);
  });
});

describe("mapDescribe when Qloo asks to choose (needs_input)", () => {
  it("offers each place once (same name and address = same place) with where it is", () => {
    const cand = (id: string, address: string) => ({
      id,
      name: "Example Shrine",
      type: "urn:entity:place",
      description: "An example shrine.",
      address,
    });
    const out = mapDescribe(
      parseEnvelope(
        {
          ...describeFixture.structuredContent,
          status: "needs_input",
          resolution: {
            issues: [
              {
                kind: "ambiguous",
                candidates: [
                  cand("s1", "1 Example Lane, Example City, Example Country"),
                  cand("s2", "1 Example Lane, Example City, Example Country"),
                  cand("s3", "9 Other Road, Other Town, Example Country"),
                ],
              },
            ],
          },
          results: [],
        },
        "qloo_describe",
      ),
    );
    expect(out.map((c) => [c.entityId, c.description])).toEqual([
      ["s1", "An example shrine. (Example City, Example Country)"],
      ["s3", "An example shrine. (Other Town, Example Country)"],
    ]);
  });
});

describe("mapFindTags with an exact match", () => {
  it("drops tags that share no real word with what was typed", () => {
    const tag = (slug: string, name: string) => ({
      id: `urn:tag:cuisine:qloo:${slug}`,
      name,
      type: "urn:tag:cuisine:qloo",
    });
    const env = parseEnvelope(
      {
        ...findTagsFixture.structuredContent,
        results: [
          tag("a", "Example Da Dish"),
          tag("b", "Example Ka Dish"),
          tag("c", "Dish"),
          tag("d", "Exa"),
          tag("e", "Unrelated Bread"),
        ],
      },
      "qloo_find_tags",
    );
    expect(mapFindTags(env, "food", "Example da dish").map((c) => c.name)).toEqual([
      "Example Da Dish",
      "Example Ka Dish",
      "Dish",
    ]);
    // Without an exact match everything Qloo offered stays (the caregiver decides).
    expect(mapFindTags(env, "food", "Something else")).toHaveLength(5);
  });
});
