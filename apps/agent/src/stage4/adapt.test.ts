import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CreateProfileResponseSchema,
  ProfileResponseSchema,
  SessionResponseSchema,
  type ProfileInput,
  type TasteItem,
} from "@memory-lane/shared";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import type { AppDb } from "../db/types";
import { createProfileStore, type ProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import { createTasteStore } from "../stage2/store";
import { createSessionStore } from "../stage3/store";

// SYNTHETIC data shaped like real Qloo envelopes (not Qloo data).
const item = (
  over: Partial<TasteItem> & Pick<TasteItem, "entityId" | "name" | "domain">,
): TasteItem => ({
  entityType: "urn:entity:artist",
  typeLabel: null,
  year: null,
  description: null,
  caption: `People who enjoy Example Singer often also enjoy ${over.name}.`,
  source: "qloo",
  becauseOf: ["Example Singer"],
  evidenceIds: [`ev-${over.entityId}`],
  ...over,
});
const ITEMS: TasteItem[] = [
  item({ entityId: "a1", name: "Example Singer", domain: "music", source: "favourite" }),
  item({ entityId: "a2", name: "Second Singer", domain: "music" }),
  item({ entityId: "a3", name: "Third Singer", domain: "music" }),
  item({
    entityId: "m1",
    name: "Old Film",
    domain: "film_tv",
    entityType: "urn:entity:movie",
    year: 1962,
  }),
  item({
    entityId: "t1",
    name: "Old Show",
    domain: "film_tv",
    entityType: "urn:entity:tv_show",
    year: 1970,
  }),
  item({
    entityId: "f1",
    name: "Example Dish",
    domain: "food",
    entityType: "urn:tag:cuisine:qloo",
  }),
  item({ entityId: "p1", name: "Example Park", domain: "places", entityType: "urn:entity:place" }),
  item({
    entityId: "p2",
    name: "Example Market",
    domain: "places",
    entityType: "urn:entity:place",
  }),
];

const NEIGHBOURS = {
  structuredContent: {
    schema_version: "1.0-preview.1",
    operation: "recommend",
    status: "ok",
    interpretation: { signals: [{ entityId: "a1", name: "Example Singer" }] },
    results: [
      {
        entity_id: "n1",
        name: "Learned Singer",
        subtype: "urn:entity:artist",
        explainability: { "signal.interests.entities": [{ entity_id: "a1", score: 1 }] },
        properties: { description: "A favourite voice of 1960s radio." },
      },
      {
        entity_id: "n2",
        name: "Modern Voice",
        subtype: "urn:entity:artist",
        properties: { description: "A star of the 2000s and 2010s." },
      },
    ],
    result_count: 2,
  },
};

function fakeQloo(): QlooMcpClient & { calls: string[] } {
  const mcp = {
    calls: [] as string[],
    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      mcp.calls.push(`${name}:${String(args.target_type)}:${JSON.stringify(args.signals)}`);
      return NEIGHBOURS;
    },
    async close() {},
  };
  return mcp;
}

const INPUT: ProfileInput = {
  nickname: "",
  birthYear: 1950,
  languages: ["English"],
  lifeStages: [{ region: "Example City", fromYear: 1950, toYear: 1975 }],
  favourites: [{ domain: "music", text: "Example Singer" }],
  avoid: [],
};

let db: AppDb;
let profiles: ProfileStore;
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
let ip = 0;

beforeAll(async () => {
  db = await createTestDb();
  profiles = createProfileStore(db);
}, 30_000);

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const headers = (token?: string) => ({
  "cf-connecting-ip": `192.0.2.${++ip}`,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function start(mcp: QlooMcpClient) {
  const gateway = createQlooGateway({
    mcp,
    evidence: createPgEvidenceStore(db),
    sleep: async () => {},
  });
  app = await buildApp({
    gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
    db: null,
    profiles,
    sessions: {
      profiles,
      taste: createTasteStore(db),
      sessions: createSessionStore(db),
      gateway,
    },
    version: "test",
    webOrigins: ["https://web.example"],
    clientIpHeader: "cf-connecting-ip",
    logger: false,
  });
  return app;
}

describe("Stage 4: the learning loop (Phase 6 gate)", () => {
  it("'sang' shifts the next session toward more like it; 'distressed' never returns", async () => {
    const mcp = fakeQloo();
    const a = await start(mcp);
    const created = await a.inject({
      method: "POST",
      url: "/api/profiles",
      payload: INPUT,
      headers: headers(),
    });
    const body = CreateProfileResponseSchema.parse(created.json());
    const id = body.profile.id;
    const token = body.ownerToken ?? "";
    await createTasteStore(db).save(id, {
      era: { from: 1955, to: 1995 },
      partial: false,
      items: ITEMS,
      notes: [],
    });

    const plan = async () =>
      SessionResponseSchema.parse(
        (
          await a.inject({
            method: "POST",
            url: `/api/profiles/${id}/sessions`,
            headers: headers(token),
          })
        ).json(),
      ).session;
    const react = (itemId: string, value: string) =>
      a.inject({
        method: "POST",
        url: `/api/session-items/${itemId}/reaction`,
        headers: headers(token),
        payload: { value },
      });

    const first = await plan();
    expect(first.whatChanged).toEqual([]);
    const byEntity = (e: string) => first.items.find((i) => i.entityId === e);
    const song = byEntity("a1");
    const place = first.items.find((i) => i.kind === "place");
    const food = byEntity("f1");
    if (!song || !place || !food) throw new Error("unexpected first session");
    await react(song.id, "sang");
    await react(place.id, "distressed");
    await react(food.id, "neutral");
    await a.inject({
      method: "POST",
      url: `/api/sessions/${first.id}/complete`,
      headers: headers(token),
    });

    const second = await plan();
    // Qloo was asked for more like the song that landed, with that exact entity as the signal.
    expect(mcp.calls).toContain('qloo_recommend:artist:["a1"]');
    // The learned, era-fitting neighbour leads the session; the mostly-later voice was filtered out.
    expect(second.items[0]?.name).toBe("Learned Singer");
    expect(second.items.some((i) => i.name === "Modern Voice")).toBe(false);
    // The place that upset them is gone, and on the avoid-list now.
    expect(second.items.some((i) => i.entityId === place.entityId)).toBe(false);
    expect(second.whatChanged.join(" ")).toMatch(/Example Singer landed well.*Learned Singer/);
    expect(second.whatChanged.join(" ")).toMatch(/won't come back/);

    const profile = ProfileResponseSchema.parse(
      (
        await a.inject({ method: "GET", url: `/api/profiles/${id}`, headers: headers(token) })
      ).json(),
    ).profile;
    expect(profile.avoid.map((x) => x.text)).toContain(place.name);

    const latest = await createTasteStore(db).latest(id);
    expect(latest?.items.find((i) => i.name === "Learned Singer")?.source).toBe("learned");

    // Session 3 without new reactions: the upsetting place still never returns.
    await a.inject({
      method: "POST",
      url: `/api/sessions/${second.id}/complete`,
      headers: headers(token),
    });
    const third = await plan();
    expect(third.items.some((i) => i.entityId === place.entityId)).toBe(false);
    expect(third.whatChanged[0]).toMatch(/No reactions were logged last time/);
  });
});
