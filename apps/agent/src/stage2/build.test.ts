import { describe, expect, it } from "vitest";
import type { TasteEvent, TasteProfile } from "@memory-lane/shared";
import type { GatewayResult, QlooGateway } from "../qloo/gateway";
import type { LlmClient } from "../llm/client";
import { buildTasteProfile } from "./build";
import type { EvidenceRow, TasteContext, TasteStore } from "./store";

// SYNTHETIC answers shaped like real Qloo envelopes (not Qloo data). Ids are fake UUIDs.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SINGER = id(1);
const SHOW = id(2);
const LANDMARK = id(3);

const recommend = (results: Record<string, unknown>[]) => ({
  schema_version: "1.0-preview.1",
  operation: "recommend",
  status: "ok",
  interpretation: { signals: [{ entityId: SINGER, name: "Example Singer" }] },
  results,
  result_count: results.length,
});
const entity = (n: number, name: string, subtype: string, properties: Record<string, unknown>) => ({
  entity_id: id(n),
  name,
  subtype,
  properties,
});
const tags = (results: { name: string; kind: string }[]) => ({
  schema_version: "1.0-preview.1",
  operation: "find_tags",
  status: "ok",
  results: results.map((r) => ({
    id: `urn:tag:${r.kind}:qloo:${r.name.toLowerCase().replace(/\W+/g, "_")}`,
    name: r.name,
    type: `urn:tag:${r.kind}:qloo`,
  })),
  result_count: results.length,
});

const ANSWERS: Record<string, Record<string, unknown>> = {
  artist: recommend([
    entity(10, "Era Singer", "urn:entity:artist", { description: "Loved in 1960s radio." }),
  ]),
  movie: recommend([]),
  tv_show: recommend([
    entity(20, "Gentle Soap", "urn:entity:tv_show", { release_year: 1972 }),
    entity(21, "Busy Ward", "urn:entity:tv_show", {
      release_year: 1975,
      description: "A medical drama set in a city hospital.",
    }),
  ]),
  "place:taste": recommend([
    entity(30, "Example Music Cellar", "urn:entity:place", {
      description: "Cellar venue steeped in 1960s memorabilia.",
      geocode: { country_code: "GB", city: "Example Town" },
    }),
    entity(31, "Example Hostel", "urn:entity:place", { description: "Budget hostel." }),
  ]),
  "place:favourite": recommend([
    entity(32, "Example Pier", "urn:entity:place", {
      description: "Victorian pier on the seafront.",
      geocode: { country_code: "GB", city: "Example Town" },
    }),
    entity(33, "Example Cemetery", "urn:entity:place", { description: "Historic cemetery." }),
  ]),
  "food:town": tags([
    { name: "Example Bar Food", kind: "cuisine" },
    { name: "Example Market Bar", kind: "cuisine" },
    { name: "Example Stew", kind: "specialty_dish" },
  ]),
  "food:region": tags([
    { name: "Examplish", kind: "cuisine" },
    { name: "Example Pie", kind: "popular_food_item" },
    { name: "Example Stew With Bread", kind: "specialty_dish" },
    { name: "Example Tart", kind: "popular_food_item" },
    { name: "Example Bun", kind: "popular_food_item" },
  ]),
};

function fakes(avoid: string[] = []) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const evidence = new Map<string, EvidenceRow>();
  const gateway: Pick<QlooGateway, "call"> = {
    async call(tool, args): Promise<GatewayResult> {
      calls.push({ tool, args: args as Record<string, unknown> });
      const a = args as unknown as Record<string, unknown>;
      const key =
        tool === "qloo_rank"
          ? `rank:${String(a.option_type)}`
          : tool === "qloo_find_tags"
            ? String(a.query).startsWith("Example Town")
              ? "food:town"
              : "food:region"
            : a.target_type === "place"
              ? (a.signals as string[]).includes(LANDMARK)
                ? "place:favourite"
                : "place:taste"
              : String(a.target_type);
      const envelope = ANSWERS[key] ?? recommend([]);
      const evidenceId = `ev-${calls.length}`;
      const results = (envelope.results as { entity_id?: string; id?: string; name: string }[]).map(
        (r) => ({ id: r.entity_id ?? r.id ?? "", name: r.name }),
      );
      evidence.set(evidenceId, { id: evidenceId, tool, status: "ok", digest: results });
      return { kind: "usable", envelope, evidenceId } as unknown as GatewayResult;
    },
  };
  const ctx: TasteContext = {
    birthYear: 1944,
    regions: ["Example Town, Exampleland"],
    languages: ["English"],
    seeds: [
      seed("music", SINGER, "Example Singer", "urn:entity:artist"),
      seed("tv", SHOW, "Example Show", "urn:entity:tv_show"),
      seed("place", LANDMARK, "Example Tower", "urn:entity:place"),
    ],
    avoid,
  };
  let saved: TasteProfile | null = null;
  const store: TasteStore = {
    context: async () => ctx,
    evidence: async (_p, ids) => [
      ...ids.flatMap((i) => (evidence.has(i) ? [evidence.get(i) as EvidenceRow] : [])),
      ...ctx.seeds.map((s) => ({
        id: s.evidenceId,
        tool: "qloo_describe",
        status: "ok",
        digest: [],
      })),
    ],
    latest: async () => saved,
    save: async (profileId, p) => {
      saved = {
        id: "tp",
        profileId,
        version: 1,
        createdAt: new Date().toISOString(),
        ...p,
        steps: p.steps ?? [],
      };
      return saved;
    },
  };
  return { calls, gateway, store };
}

function seed(domain: string, entityId: string, name: string, entityType: string) {
  return {
    name,
    domain,
    entityId,
    entityType,
    year: null,
    description: null,
    evidenceId: `ev-seed-${name}`,
  };
}

describe("Stage 2 research plan", () => {
  it("asks each domain with its own favourites, and keeps what is lasting, gentle and a real dish", async () => {
    const { calls, gateway, store } = fakes();
    const events: TasteEvent[] = [];
    const profile = await buildTasteProfile(
      { profileId: "p", nickname: null },
      { gateway, store },
      (e) => events.push(e),
    );
    if (!profile) throw new Error("not built");
    const args = (pred: (c: (typeof calls)[number]) => boolean) =>
      calls.filter(pred).map((c) => c.args);

    // Singers from the singer; TV from the show plus the singer; places twice: from their tastes and
    // from the place they love.
    expect(args((c) => c.args.target_type === "artist")[0]?.signals).toEqual([SINGER]);
    expect(args((c) => c.args.target_type === "tv_show")[0]?.signals).toEqual([SHOW, SINGER]);
    const places = args((c) => c.args.target_type === "place");
    expect(places.map((p) => p.signals)).toEqual([[SINGER, SHOW], [LANDMARK]]);
    expect(places.every((p) => p.filter_location === "Example Town, Exampleland")).toBe(true);
    // Dishes for the town and for its region.
    expect(args((c) => c.tool === "qloo_find_tags").map((a) => a.query)).toEqual([
      "Example Town food",
      "Exampleland food",
    ]);

    const names = (domain: string) =>
      profile.items.filter((i) => i.domain === domain && i.source === "qloo").map((i) => i.name);
    // The hospital drama is left out; the soap stays.
    expect(names("film_tv")).toEqual(["Gentle Soap"]);
    // A memorabilia-steeped venue counts as lasting; hostels and cemeteries don't.
    expect(names("places")).toEqual(["Example Music Cellar", "Example Pier"]);
    expect(profile.items.find((i) => i.name === "Example Pier")?.locality).toBe("Example Town");
    // Restaurant styles, a label that only names the people, and a variant of a dish are left out;
    // at most three dishes are added.
    expect(names("food")).toEqual(["Example Stew", "Example Pie", "Example Tart"]);
    // The build's own log is kept.
    expect(profile.steps.length).toBeGreaterThan(4);
    expect(profile.steps.join(" ")).toMatch(/singers enjoyed by people who love Example Singer/);
    expect(events.filter((e) => e.type === "step").length).toBe(profile.steps.length - 1);
  });
});

describe("Stage 2 gap filling with the LLM", () => {
  it("lets the AI propose era singers, which count only once Qloo ranks them and their years fit", async () => {
    ANSWERS["rank:artist"] = recommend([
      entity(40, "Proposed Voice", "urn:entity:artist", { description: "A star of 1960s radio." }),
      entity(41, "Modern Star", "urn:entity:artist", { description: "Famous in the 2010s." }),
    ]);
    const { calls, gateway, store } = fakes();
    const asked: unknown[] = [];
    const llm: LlmClient = {
      configured: true,
      model: "test-model",
      async json(req) {
        asked.push(req.input);
        const data = { tvShows: [], singers: ["Proposed Voice", "Modern Star"] };
        return { kind: "ok", data: req.schema.parse(data), cached: false };
      },
    };
    const profile = await buildTasteProfile(
      { profileId: "p", nickname: null },
      { gateway, store, llm },
      () => {},
    );
    if (!profile) throw new Error("not built");
    // Only one Qloo-placed era singer was kept, so singers were asked for (TV was already there).
    expect(asked[0]).toMatchObject({ asked: ["singers"], years: { from: 1949, to: 1989 } });
    const rank = calls.find((c) => c.tool === "qloo_rank");
    expect(rank?.args).toMatchObject({
      options: ["Proposed Voice", "Modern Star"],
      option_type: "artist",
      signals: [SINGER],
    });
    // The later star is left out; the era voice joins, with the rank call as its evidence.
    const music = profile.items.filter((i) => i.domain === "music").map((i) => i.name);
    expect(music).toContain("Proposed Voice");
    expect(music).not.toContain("Modern Star");
    expect(profile.steps.join(" ")).toMatch(/the AI suggested Proposed Voice and Modern Star/);
    // Said plainly, with Qloo's rank.
    expect(profile.items.find((i) => i.name === "Proposed Voice")).toMatchObject({
      source: "proposed",
      caption: expect.stringMatching(
        /^Suggested for their years by the AI; Qloo matched it and ranked it 1st of 2/,
      ),
    });
    delete ANSWERS["rank:artist"];
  });

  it("never names or sends to Qloo a proposal on the avoid-list or about a painful subject (security review W1)", async () => {
    ANSWERS["rank:artist"] = recommend([
      entity(40, "Proposed Voice", "urn:entity:artist", { description: "A star of 1960s radio." }),
    ]);
    const { calls, gateway, store } = fakes(["Avoided Crooner", "Medication times"]);
    const asked: Record<string, unknown>[] = [];
    const llm: LlmClient = {
      configured: true,
      model: "test-model",
      async json(req) {
        asked.push(req.input);
        const data = {
          tvShows: [],
          singers: ["Proposed Voice", "Avoided Crooner", "Songs of the Holocaust"],
        };
        return { kind: "ok", data: req.schema.parse(data), cached: false };
      },
    };
    const profile = await buildTasteProfile(
      { profileId: "p", nickname: null },
      { gateway, store, llm },
      () => {},
    );
    if (!profile) throw new Error("not built");
    // The model is told what to avoid (never health topics) and gets the era, not a birth year.
    expect(asked[0]?.thingsToAvoid).toEqual(["Avoided Crooner"]);
    expect(asked[0]).not.toHaveProperty("bornIn");
    expect(calls.find((c) => c.tool === "qloo_rank")?.args.options).toEqual(["Proposed Voice"]);
    expect(profile.steps.join(" ")).not.toMatch(/Avoided Crooner|Holocaust/);
    delete ANSWERS["rank:artist"];
  });
});
