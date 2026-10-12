import { describe, expect, it } from "vitest";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import { parseEnvelope } from "../qloo/envelope";
import { describeTypeFor, mapDescribe } from "./mapDescribe";

describe("mapDescribe (provisional until Phase 0)", () => {
  it("reads candidates from the synthetic envelope", () => {
    const out = mapDescribe(parseEnvelope(describeFixture.structuredContent, "qloo_describe"));
    expect(out).toEqual([
      {
        entityId: "00000000-0000-4000-8000-00000000000a",
        name: "Example Artist A",
        entityType: "artist",
        year: null,
      },
      {
        entityId: "00000000-0000-4000-8000-00000000000b",
        name: "Example Artist A (tribute band)",
        entityType: "artist",
        year: null,
      },
    ]);
  });

  it("reads years from common fields, skips incomplete items and caps at five", () => {
    const env = parseEnvelope(
      {
        ...describeFixture.structuredContent,
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
      },
      "qloo_describe",
    );
    const out = mapDescribe(env);
    expect(out).toHaveLength(5);
    expect(out[0]).toMatchObject({ entityType: "movie", year: 1960 });
    expect(out[1]).toMatchObject({ name: "Film Two", year: 1957 });
  });

  it("asks Qloo for a type only where the domain maps cleanly", () => {
    expect(describeTypeFor("music")).toBe("artist");
    expect(describeTypeFor("tv")).toBe("tv_show");
    expect(describeTypeFor("food")).toBeUndefined();
  });
});
