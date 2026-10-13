import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CreateProfileResponseSchema,
  TasteEventSchema,
  type ProfileInput,
  type TasteEvent,
} from "@memory-lane/shared";
import authError from "../../test/fixtures/harness/qloo-auth-error.json";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import findTagsFixture from "../../test/fixtures/synthetic/qloo_find_tags.json";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import { tasteProfiles } from "../db/schema";
import type { AppDb } from "../db/types";
import { createProfileStore, type ProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import { createResolutionStore } from "../stage1/store";
import { createTasteStore } from "./store";

// SYNTHETIC answers shaped like real Qloo envelopes (shape pinned 2026-10-13). Not Qloo data.
const SEED = "00000000-0000-4000-8000-00000000000a";
const env = (operation: string, results: unknown[], status = "ok") => ({
  structuredContent: {
    schema_version: "1.0-preview.1",
    operation,
    status,
    interpretation: { signals: [{ entityId: SEED, name: "Example Artist A" }] },
    results,
    result_count: results.length,
  },
});
const rec = (id: string, name: string, subtype: string, props: Record<string, unknown>) => ({
  entity_id: `00000000-0000-4000-8000-0000000002${id}`,
  name,
  type: "urn:entity",
  subtype,
  explainability: { "signal.interests.entities": [{ entity_id: SEED, score: 1 }] },
  properties: props,
});
const ARTISTS = env("recommend", [
  rec("01", "Modern Voice", "urn:entity:artist", { description: "A star of the 2000s and 2010s." }),
  rec("02", "Classic Voice", "urn:entity:artist", { description: "Loved in 1950s–60s cinema." }),
  rec("03", "Sad Ballads", "urn:entity:artist", { description: "Songs about Partition." }),
  rec("04", "Gentle Voice", "urn:entity:artist", { description: "A warm, soft voice." }),
]);
const MOVIES = env("recommend", [
  rec("11", "Old Classic", "urn:entity:movie", { release_year: 1962 }),
  rec("12", "New Blockbuster", "urn:entity:movie", { release_year: 2015 }),
  rec("13", "Hard Times", "urn:entity:movie", {
    release_year: 1970,
    description: "Set in Partition.",
  }),
]);
const SHOWS = env("recommend", [], "empty");
const PLACES = env("recommend", [
  rec("21", "Example Garden", "urn:entity:place", { description: "A public garden." }),
  rec("22", "Example Market", "urn:entity:place", {}),
]);
const DISHES = env("find_tags", [
  { id: "urn:tag:cuisine:qloo:region_bread", name: "Region Bread", type: "urn:tag:cuisine:qloo" },
  { id: "urn:tag:genre:qloo:region_music", name: "Region Music", type: "urn:tag:genre:qloo" },
  { id: "urn:tag:cuisine:qloo:example_dish", name: "Example Dish", type: "urn:tag:cuisine:qloo" },
]);
const NO_KEY = { isError: true, structuredContent: authError.structuredContent };

const INPUT: ProfileInput = {
  nickname: "Harjeet",
  birthYear: 1950,
  languages: ["Punjabi"],
  lifeStages: [{ region: "Example City, Example Country", fromYear: 1950, toYear: 1975 }],
  favourites: [
    { domain: "music", text: "Example Artist A" },
    { domain: "food", text: "Example dish" },
  ],
  avoid: [{ text: "Partition memories" }],
};

/** Answers by tool (and target type), the way the real harness would. */
function fakeQloo(stage2: "ok" | "no_key" = "ok"): QlooMcpClient & { calls: string[] } {
  const mcp = {
    calls: [] as string[],
    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const target = typeof args.target_type === "string" ? `:${args.target_type}` : "";
      mcp.calls.push(`${name}${target}`);
      if (name === "qloo_describe") return { structuredContent: describeFixture.structuredContent };
      if (name === "qloo_find_tags" && String(args.query).endsWith(" food")) {
        return stage2 === "no_key" ? NO_KEY : DISHES;
      }
      if (name === "qloo_find_tags")
        return { structuredContent: findTagsFixture.structuredContent };
      if (stage2 === "no_key") return NO_KEY;
      const byTarget: Record<string, McpToolResult> = {
        artist: ARTISTS,
        movie: MOVIES,
        tv_show: SHOWS,
        place: PLACES,
      };
      return byTarget[String(args.target_type)] ?? SHOWS;
    },
    async close() {},
  };
  return mcp;
}

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
    resolution: { profiles, resolutions: createResolutionStore(db), gateway },
    taste: { profiles, store: createTasteStore(db), gateway, db },
    version: "test",
    webOrigins: ["https://web.example"],
    clientIpHeader: "cf-connecting-ip",
    logger: false,
  });
  return app;
}

const headers = (token?: string) => ({
  "cf-connecting-ip": `198.51.100.${++ip}`,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});

/** Creates a profile and confirms the first match of every favourite through the real Stage 1. */
async function confirmedProfile(a: Awaited<ReturnType<typeof buildApp>>) {
  const created = await a.inject({
    method: "POST",
    url: "/api/profiles",
    payload: INPUT,
    headers: headers(),
  });
  const body = CreateProfileResponseSchema.parse(created.json());
  const token = body.ownerToken ?? "";
  const id = body.profile.id;
  await a.inject({
    method: "POST",
    url: `/api/profiles/${id}/seeds/resolve`,
    headers: headers(token),
  });
  const listed = await a.inject({
    method: "GET",
    url: `/api/profiles/${id}/seeds`,
    headers: headers(token),
  });
  const decisions = listed
    .json()
    .resolutions.map((r: { seedId: string; candidates: { id: string }[] }) => ({
      seedId: r.seedId,
      candidateId: r.candidates[0]?.id ?? null,
    }));
  await a.inject({
    method: "POST",
    url: `/api/profiles/${id}/seeds/confirm`,
    headers: headers(token),
    payload: { decisions },
  });
  return { id, token };
}

const events = (body: string): TasteEvent[] =>
  body
    .split("\n\n")
    .filter((c) => c.startsWith("data: "))
    .map((c) => TasteEventSchema.parse(JSON.parse(c.slice(6))));

async function build(a: Awaited<ReturnType<typeof buildApp>>, id: string, token: string) {
  const res = await a.inject({
    method: "POST",
    url: `/api/profiles/${id}/taste-profile`,
    headers: headers(token),
  });
  return { res, events: events(res.body) };
}

describe("Stage 2: Life Taste Profile", () => {
  it("builds four grounded domains from the confirmed favourites, in their era", async () => {
    const mcp = fakeQloo();
    const a = await start(mcp);
    const { id, token } = await confirmedProfile(a);
    const { res, events: ev } = await build(a, id, token);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    const done = ev.at(-1);
    if (done?.type !== "done" || !done.data) throw new Error("no profile");
    const profile = done.data;
    const names = (domain: string) =>
      profile.items.filter((i) => i.domain === domain).map((i) => i.name);

    // Favourites first; artists Qloo describes as active in their era before unknown ones; the
    // mostly-later star and the avoid-list match are left out.
    expect(names("music")).toEqual(["Example Artist A", "Classic Voice", "Gentle Voice"]);
    // Films only from 1955–1995; the Partition film is avoided even though only its description says so.
    expect(names("film_tv")).toEqual(["Old Classic"]);
    expect(names("food")).toEqual(["Example Dish", "Region Bread"]);
    expect(names("places")).toEqual(["Example Garden", "Example Market"]);

    expect(profile.era).toEqual({ from: 1955, to: 1995 });
    expect(profile.items.every((i) => i.evidenceIds.length > 0)).toBe(true);
    const classic = profile.items.find((i) => i.name === "Classic Voice");
    expect(classic).toMatchObject({
      source: "qloo",
      caption: "People who enjoy Example Artist A often also enjoy Classic Voice.",
      becauseOf: ["Example Artist A"],
    });
    expect(profile.items.find((i) => i.name === "Example Garden")?.caption).toMatch(
      /, in Example City\.$/,
    );
    expect(profile.notes.join(" ")).toMatch(/kept to 1955–1995/);
    expect(profile.notes.join(" ")).toMatch(/things to avoid/);
    // Never the nickname or the avoid text in what reached Qloo (the PII guard sits in front).
    expect(mcp.calls.filter((c) => c.startsWith("qloo_recommend"))).toHaveLength(4);
    expect(res.body).not.toMatch(/Harjeet/);
  });

  it("keeps versions, and serves the latest", async () => {
    const a = await start(fakeQloo());
    const { id, token } = await confirmedProfile(a);
    await build(a, id, token);
    await build(a, id, token);
    const got = await a.inject({
      method: "GET",
      url: `/api/profiles/${id}/taste-profile`,
      headers: headers(token),
    });
    expect(got.json().tasteProfile.version).toBe(2);
    const rows = await db.select().from(tasteProfiles).where(eq(tasteProfiles.profileId, id));
    expect(rows).toHaveLength(2);
  });

  it("stops honestly without a Qloo key and saves nothing", async () => {
    const a = await start(fakeQloo("no_key"));
    const { id, token } = await confirmedProfile(a);
    const { res, events: ev } = await build(a, id, token);
    expect(ev.find((e) => e.type === "error")).toMatchObject({ problem: "qloo_not_connected" });
    expect(ev.at(-1)).toMatchObject({ type: "done", data: null });
    expect(res.body).not.toMatch(/qloo setup|QLOO_API_KEY/i);
    const got = await a.inject({
      method: "GET",
      url: `/api/profiles/${id}/taste-profile`,
      headers: headers(token),
    });
    expect(got.json().tasteProfile).toBeNull();
  });

  it("needs a confirmed favourite, and is owner-only (evidence too)", async () => {
    const a = await start(fakeQloo());
    const fresh = await a.inject({
      method: "POST",
      url: "/api/profiles",
      payload: INPUT,
      headers: headers(),
    });
    const freshBody = CreateProfileResponseSchema.parse(fresh.json());
    const early = await a.inject({
      method: "POST",
      url: `/api/profiles/${freshBody.profile.id}/taste-profile`,
      headers: headers(freshBody.ownerToken ?? ""),
    });
    expect(early.statusCode).toBe(409);

    const { id, token } = await confirmedProfile(a);
    const { events: ev } = await build(a, id, token);
    const done = ev.at(-1);
    if (done?.type !== "done" || !done.data) throw new Error("no profile");
    const evidenceId = done.data.items[0]?.evidenceIds[0];
    const mine = await a.inject({
      method: "GET",
      url: `/api/evidence/${evidenceId}`,
      headers: headers(token),
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toMatchObject({ tool: "qloo_describe", status: "ok" });
    expect(mine.json().summary).toBeUndefined();

    const stranger = freshBody.ownerToken ?? "";
    for (const url of [`/api/profiles/${id}/taste-profile`, `/api/evidence/${evidenceId}`]) {
      const res = await a.inject({ method: "GET", url, headers: headers(stranger) });
      expect(res.statusCode, url).toBe(404);
    }
  });
});
