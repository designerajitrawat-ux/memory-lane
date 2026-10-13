import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CreateProfileResponseSchema,
  SessionResponseSchema,
  type ProfileInput,
  type TasteItem,
  type TasteProfile,
} from "@memory-lane/shared";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import type { AppDb } from "../db/types";
import { createProfileStore, type ProfileStore } from "../profiles/store";
import { avoidMatcher } from "../stage2/avoid";
import { createTasteStore } from "../stage2/store";
import { composeSession, type ComposedItem } from "./compose";
import { createSessionStore } from "./store";
import { validateSessionItems } from "./validate";

// SYNTHETIC taste profile items (not Qloo data).
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
  item({ entityId: "a4", name: "Fourth Singer", domain: "music" }),
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
];
const profileOf = (items: TasteItem[]): TasteProfile => ({
  id: "tp1",
  profileId: "p",
  version: 1,
  createdAt: new Date().toISOString(),
  era: { from: 1955, to: 1995 },
  partial: false,
  items,
  notes: [],
});

describe("composeSession", () => {
  it("follows the template: opening song, film/TV, food, place, choice, closing song", () => {
    const items = composeSession({ profile: profileOf(ITEMS), sessionNumber: 1 });
    expect(items.map((i) => i.kind)).toEqual(["song", "film", "food", "place", "song", "song"]);
    expect(items[0]?.name).toBe("Example Singer"); // favourites open
    const total = items.reduce((a, i) => a + i.minutes, 0);
    expect(total).toBeGreaterThanOrEqual(20);
    expect(total).toBeLessThanOrEqual(30);
    expect(items.every((i) => i.prompts.length >= 2 && i.evidenceIds.length > 0)).toBe(true);
    expect(items[0]?.link.url).toMatch(/^https:\/\/www\.youtube\.com\/results\?search_query=/);
    expect(items.find((i) => i.kind === "place")?.link.url).toMatch(/google\.com\/maps/);
  });

  it("fills empty domains with songs and rotates last session's items out", () => {
    const musicOnly = ITEMS.filter((i) => i.domain === "music");
    const first = composeSession({ profile: profileOf(musicOnly), sessionNumber: 1 });
    expect(first.every((i) => i.kind === "song")).toBe(true);
    const second = composeSession({
      profile: profileOf(ITEMS),
      sessionNumber: 2,
      recent: new Set(["a1", "m1"]),
    });
    expect(second[0]?.entityId).not.toBe("a1");
    expect(second.find((i) => i.domain === "film_tv")?.entityId).toBe("t1");
  });

  it("never brings back an item that upset them, and favours what landed (Stage 4 weights)", () => {
    const items = composeSession({
      profile: profileOf(ITEMS),
      sessionNumber: 3,
      weights: new Map([
        ["a1", -1],
        ["a3", 2],
      ]),
      favouriteDomain: "places",
    });
    expect(items.some((i) => i.entityId === "a1")).toBe(false);
    expect(items[0]?.entityId).toBe("a3");
  });
});

describe("validateSessionItems (the session gate)", () => {
  const composed = composeSession({ profile: profileOf(ITEMS), sessionNumber: 1 });
  const base = composed[1] as ComposedItem;

  it("blocks invented entities, borrowed evidence, avoided topics, bad wording and odd links", () => {
    const bad: ComposedItem[] = [
      { ...base, entityId: "invented", name: "A Film The LLM Made Up" },
      { ...base, evidenceIds: ["ev-a2"] }, // evidence from another item
      { ...base, name: "Old Film", description: "Set during the Vietnam war." },
      { ...base, why: "She loved this film." },
      { ...base, link: { url: "https://example.com/stream", label: "Watch" } },
    ];
    const { kept, dropped } = validateSessionItems(
      [...bad, base],
      ITEMS,
      avoidMatcher(["Vietnam War"]),
      1,
    );
    expect(dropped.map((d) => d.reason)).toEqual([
      "not_in_profile",
      "not_in_profile",
      "avoid",
      "language",
      "link",
    ]);
    expect(kept).toHaveLength(1);
  });

  it("replaces prompts that read like memory tests", () => {
    const { kept } = validateSessionItems(
      [{ ...base, prompts: ["Do you remember who starred in it?"] }],
      ITEMS,
      avoidMatcher([]),
      1,
    );
    expect(kept[0]?.prompts.some((p) => /remember/i.test(p))).toBe(false);
    expect(kept[0]?.prompts.length).toBeGreaterThan(0);
  });
});

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
  "cf-connecting-ip": `203.0.113.${++ip}`,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

async function start() {
  app = await buildApp({
    gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
    db: null,
    profiles,
    sessions: { profiles, taste: createTasteStore(db), sessions: createSessionStore(db) },
    version: "test",
    webOrigins: ["https://web.example"],
    clientIpHeader: "cf-connecting-ip",
    logger: false,
  });
  return app;
}

async function profileWithTaste(a: Awaited<ReturnType<typeof buildApp>>, withTaste = true) {
  const res = await a.inject({
    method: "POST",
    url: "/api/profiles",
    payload: INPUT,
    headers: headers(),
  });
  const body = CreateProfileResponseSchema.parse(res.json());
  if (withTaste) {
    await createTasteStore(db).save(body.profile.id, {
      era: { from: 1955, to: 1995 },
      partial: false,
      items: ITEMS,
      notes: [],
    });
  }
  return { id: body.profile.id, token: body.ownerToken ?? "" };
}

describe("Stage 3 routes", () => {
  it("plans a session, logs reactions, finishes it, and rotates the next one", async () => {
    const a = await start();
    const { id, token } = await profileWithTaste(a);
    const created = await a.inject({
      method: "POST",
      url: `/api/profiles/${id}/sessions`,
      headers: headers(token),
    });
    expect(created.statusCode).toBe(201);
    const { session } = SessionResponseSchema.parse(created.json());
    expect(session.number).toBe(1);
    expect(session.items).toHaveLength(6);
    expect(session.status).toBe("planned");

    const first = session.items[0];
    if (!first) throw new Error("no item");
    const reacted = await a.inject({
      method: "POST",
      url: `/api/session-items/${first.id}/reaction`,
      headers: headers(token),
      payload: { value: "sang", note: "Smiled at the chorus." },
    });
    expect(reacted.json().item).toMatchObject({ reaction: "sang", note: "Smiled at the chorus." });

    const got = SessionResponseSchema.parse(
      (
        await a.inject({
          method: "GET",
          url: `/api/sessions/${session.id}`,
          headers: headers(token),
        })
      ).json(),
    );
    expect(got.session.status).toBe("in_progress");

    const done = await a.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/complete`,
      headers: headers(token),
    });
    expect(done.json().session.status).toBe("done");

    const next = SessionResponseSchema.parse(
      (
        await a.inject({
          method: "POST",
          url: `/api/profiles/${id}/sessions`,
          headers: headers(token),
        })
      ).json(),
    );
    expect(next.session.number).toBe(2);
    expect(next.session.items[0]?.entityId).not.toBe(first.entityId);

    const list = await a.inject({
      method: "GET",
      url: `/api/profiles/${id}/sessions`,
      headers: headers(token),
    });
    expect(
      list.json().sessions.map((s: { number: number; reacted: number }) => [s.number, s.reacted]),
    ).toEqual([
      [2, 0],
      [1, 1],
    ]);
  });

  it("needs a taste profile, and is owner-only", async () => {
    const a = await start();
    const bare = await profileWithTaste(a, false);
    const early = await a.inject({
      method: "POST",
      url: `/api/profiles/${bare.id}/sessions`,
      headers: headers(bare.token),
    });
    expect(early.statusCode).toBe(409);

    const { id, token } = await profileWithTaste(a);
    const { session } = SessionResponseSchema.parse(
      (
        await a.inject({
          method: "POST",
          url: `/api/profiles/${id}/sessions`,
          headers: headers(token),
        })
      ).json(),
    );
    const itemId = session.items[0]?.id;
    for (const [method, url, payload] of [
      ["GET", `/api/sessions/${session.id}`, undefined],
      ["POST", `/api/session-items/${itemId}/reaction`, { value: "sang" }],
      ["POST", `/api/sessions/${session.id}/complete`, undefined],
      ["GET", `/api/profiles/${id}/sessions`, undefined],
    ] as const) {
      const res = await a.inject({
        method,
        url,
        headers: headers(bare.token),
        ...(payload ? { payload } : {}),
      });
      expect(res.statusCode, url).toBe(404);
    }
  });
});
