import { beforeAll, describe, expect, it } from "vitest";
import {
  DemoProfilesResponseSchema,
  ProfileInputSchema,
  SessionResponseSchema,
  TasteProfileSchema,
  TryDemoResponseSchema,
} from "@memory-lane/shared";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import findTagsFixture from "../../test/fixtures/synthetic/qloo_find_tags.json";
import recommendFixture from "../../test/fixtures/synthetic/qloo_recommend.json";
import { createTestDb } from "../../test/pglite";
import { eq } from "drizzle-orm";
import { buildApp } from "../app";
import { profiles as profilesTable } from "../db/schema";
import type { AppDb } from "../db/types";
import { createProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import { createResolutionStore } from "../stage1/store";
import { createTasteStore } from "../stage2/store";
import { createSessionStore } from "../stage3/store";
import { DEMO_PERSONAS, demoOwnerHash, demoOwnerPrefix } from "./personas";
import { STALE_SEED_MS, ensureDemoProfiles } from "./seed";

// SYNTHETIC answers (not Qloo data): every describe matches, every recommend returns era films.
// SYNTHETIC image URLs from the fixtures (not Qloo data).
const QLOO_A = "https://images.qloo.com/i/00000000-0000-4000-8000-00000000000a-420x-auto.jpg";
const QLOO_FILM = "https://images.qloo.com/i/00000000-0000-4000-8000-000000000101-420x-auto.jpg";

const fake: QlooMcpClient = {
  async callTool(name: string): Promise<McpToolResult> {
    if (name === "qloo_describe") return { structuredContent: describeFixture.structuredContent };
    if (name === "qloo_find_tags") return { structuredContent: findTagsFixture.structuredContent };
    return { structuredContent: recommendFixture.structuredContent };
  },
  async close() {},
};

let db: AppDb;

beforeAll(async () => {
  db = await createTestDb();
}, 30_000);

function seedDeps(on: AppDb) {
  const gateway = createQlooGateway({
    mcp: fake,
    evidence: createPgEvidenceStore(on),
    sleep: async () => {},
  });
  return {
    db: on,
    profiles: createProfileStore(on),
    resolutions: createResolutionStore(on),
    taste: createTasteStore(on),
    sessions: createSessionStore(on),
    gateway,
    log: { info: () => {}, warn: () => {} },
  };
}

describe("demo personas (the judge path)", () => {
  it("are seeded through the real pipeline once, and are public but read-only", async () => {
    const profiles = createProfileStore(db);
    const gateway = createQlooGateway({
      mcp: fake,
      evidence: createPgEvidenceStore(db),
      sleep: async () => {},
    });
    const deps = {
      db,
      profiles,
      resolutions: createResolutionStore(db),
      taste: createTasteStore(db),
      sessions: createSessionStore(db),
      gateway,
      log: { info: () => {}, warn: () => {} },
    };
    await ensureDemoProfiles(deps);
    await ensureDemoProfiles(deps); // a second start leaves them alone

    const app = await buildApp({
      gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
      db: null,
      profiles,
      taste: { profiles, store: deps.taste, gateway, db },
      sessions: { profiles, taste: deps.taste, sessions: deps.sessions, gateway },
      version: "test",
      webOrigins: ["https://web.example"],
      logger: false,
    });
    try {
      const list = DemoProfilesResponseSchema.parse(
        (await app.inject({ method: "GET", url: "/api/demo-profiles" })).json(),
      );
      expect(list.profiles.map((p) => p.nickname)).toEqual(["Dorothy", "Harjeet", "Margaret"]);
      const id = list.profiles[0]?.id ?? "";

      // Readable without any token.
      const taste = await app.inject({ method: "GET", url: `/api/profiles/${id}/taste-profile` });
      expect(taste.statusCode).toBe(200);
      const evidenceId = taste.json().tasteProfile.items[0].evidenceIds[0];
      const evidence = await app.inject({ method: "GET", url: `/api/evidence/${evidenceId}` });
      expect(evidence.statusCode).toBe(200);
      expect(evidence.json()).toHaveProperty("names");
      expect(Array.isArray(evidence.json().results)).toBe(true);
      // The build's own log is kept for "How Memory Lane built this".
      expect(taste.json().tasteProfile.steps.length).toBeGreaterThan(2);
      // Qloo's pictures travel with the items (the favourite's photo from Stage 1, a recommended
      // film's poster), never a picture from anywhere else, and the demo picker previews them.
      const tasteItems = TasteProfileSchema.parse(taste.json().tasteProfile).items;
      expect(tasteItems.find((i) => i.source === "favourite")?.image).toBe(QLOO_A);
      expect(tasteItems.find((i) => i.name === "Example Film One")?.image).toBe(QLOO_FILM);
      expect(tasteItems.find((i) => i.name === "Example Film Two")?.image ?? null).toBeNull();
      expect(list.profiles[0]?.preview[0]).toBe(QLOO_A);
      const sessions = (
        await app.inject({ method: "GET", url: `/api/profiles/${id}/sessions` })
      ).json().sessions as { id: string; number: number; status: string }[];
      expect(sessions.map((s) => [s.number, s.status])).toEqual([
        [2, "planned"],
        [1, "done"],
      ]);
      const second = SessionResponseSchema.parse(
        (await app.inject({ method: "GET", url: `/api/sessions/${sessions[0]?.id}` })).json(),
      );
      expect(second.readOnly).toBe(true);
      expect(second.session.whatChanged.length).toBeGreaterThan(0);

      // Never changeable by visitors, nor by another owner with a valid token.
      const other = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: { "x-forwarded-for": "192.0.2.77" },
        payload: DEMO_PERSONAS[0]?.input,
      });
      const otherToken = other.json().ownerToken as string;
      expect(otherToken).toBeTruthy();
      for (const auth of [{}, { authorization: `Bearer ${otherToken}` }])
        for (const [method, url, payload] of [
          ["POST", `/api/profiles/${id}/sessions`, undefined],
          ["POST", `/api/profiles/${id}/taste-profile`, undefined],
          ["POST", `/api/session-items/${second.session.items[0]?.id}/reaction`, { value: "sang" }],
          ["POST", `/api/sessions/${second.session.id}/complete`, undefined],
          ["DELETE", `/api/profiles/${id}`, undefined],
        ] as const) {
          const res = await app.inject({
            method,
            url,
            headers: auth,
            ...(payload ? { payload } : {}),
          });
          expect([401, 404], url).toContain(res.statusCode);
        }

      // "Try it yourself": a private copy with session 1, on a new device token.
      const tried = await app.inject({
        method: "POST",
        url: `/api/demo-profiles/${id}/try`,
        headers: { "x-forwarded-for": "192.0.2.78" },
      });
      expect(tried.statusCode).toBe(201);
      const triedBody = TryDemoResponseSchema.parse(tried.json());
      expect(triedBody.ownerToken).toBeTruthy();
      expect(triedBody.session.number).toBe(1);
      // The copy's session shows the same pictures (copied seeds and taste profile).
      const copyImages = triedBody.session.items.map((i) => i.image ?? null);
      expect(copyImages.some((url) => url === QLOO_A || url === QLOO_FILM)).toBe(true);
      expect(
        copyImages.every((url) => url === null || url.startsWith("https://images.qloo.com/i/")),
      ).toBe(true);
      expect(triedBody.session.profileId).not.toBe(id);
      const mine = { authorization: `Bearer ${triedBody.ownerToken}` };
      const copyTaste = (
        await app.inject({
          method: "GET",
          url: `/api/profiles/${triedBody.session.profileId}/taste-profile`,
          headers: mine,
        })
      ).json().tasteProfile;
      // Its own evidence records (copies), readable by its owner; no learned items yet.
      const copyEvidence = copyTaste.items[0].evidenceIds[0];
      expect(copyEvidence).not.toBe(evidenceId);
      expect(
        (await app.inject({ method: "GET", url: `/api/evidence/${copyEvidence}`, headers: mine }))
          .statusCode,
      ).toBe(200);
      expect(copyTaste.items.some((i: { source: string }) => i.source === "learned")).toBe(false);
      const react = await app.inject({
        method: "POST",
        url: `/api/session-items/${triedBody.session.items[0]?.id}/reaction`,
        headers: mine,
        payload: { value: "sang" },
      });
      expect(react.statusCode).toBe(200);
      // Trying again on that device before playing returns the same copy and session (idempotent).
      const fresh = await app.inject({
        method: "POST",
        url: `/api/demo-profiles/${id}/try`,
        headers: { "x-forwarded-for": "192.0.2.79" },
      });
      const freshBody = TryDemoResponseSchema.parse(fresh.json());
      const again = await app.inject({
        method: "POST",
        url: `/api/demo-profiles/${id}/try`,
        headers: {
          "x-forwarded-for": "192.0.2.79",
          authorization: `Bearer ${freshBody.ownerToken}`,
        },
      });
      expect(again.statusCode).toBe(201);
      const againBody = TryDemoResponseSchema.parse(again.json());
      expect(againBody.session.id).toBe(freshBody.session.id);
      expect(againBody.ownerToken).toBeUndefined();
      // Only demos can be tried; a copy's records stay its owner's.
      const notDemo = await app.inject({
        method: "POST",
        url: `/api/demo-profiles/${triedBody.session.profileId}/try`,
        headers: { "x-forwarded-for": "192.0.2.80" },
      });
      expect(notDemo.statusCode).toBe(404);
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/evidence/${copyEvidence}`,
            headers: { authorization: `Bearer ${otherToken}` },
          })
        ).statusCode,
      ).toBe(404);
      // A demo's notes are never shown to visitors.
      await deps.sessions.react(
        second.session.items[1]?.id ?? "",
        demoOwnerHash("dorothy-us"),
        "sang",
        "Hummed along",
        {
          seeding: true,
        },
      );
      const visitorView = SessionResponseSchema.parse(
        (await app.inject({ method: "GET", url: `/api/sessions/${second.session.id}` })).json(),
      );
      expect(visitorView.session.items.every((i) => i.note === null)).toBe(true);

      // The demo itself is unchanged.
      const demoSessions = (
        await app.inject({ method: "GET", url: `/api/profiles/${id}/sessions` })
      ).json().sessions as unknown[];
      expect(demoSessions).toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it("rebuild a half-built persona once stale, drop older versions, and list only complete ones", async () => {
    const fresh = await createTestDb();
    const deps = seedDeps(fresh);
    const [dorothy, harjeet] = DEMO_PERSONAS;
    if (!dorothy || !harjeet) throw new Error("personas");
    // An older version of Dorothy, and a current Harjeet that a restart left half-built.
    await deps.profiles.create(
      ProfileInputSchema.parse(dorothy.input),
      demoOwnerPrefix(dorothy.key),
      {
        isDemo: true,
      },
    );
    const halfBuilt = await deps.profiles.create(
      ProfileInputSchema.parse(harjeet.input),
      demoOwnerHash(harjeet.key),
      {
        isDemo: true,
      },
    );
    expect(await deps.profiles.listDemos()).toEqual([]); // nothing incomplete is shown

    // Still fresh: another instance may be building it, so it is left alone.
    await ensureDemoProfiles(deps);
    let names = (await deps.profiles.listDemos()).map((d) => d.nickname);
    expect(names).toEqual(["Dorothy", "Margaret"]);

    // Stale: rebuilt.
    await ensureDemoProfiles({ ...deps, now: () => Date.now() + STALE_SEED_MS + 1000 });
    const demos = await deps.profiles.listDemos();
    names = demos.map((d) => d.nickname);
    expect(names).toEqual(["Dorothy", "Margaret", "Harjeet"]);
    expect(demos.some((d) => d.id === halfBuilt.id)).toBe(false);
    // The older Dorothy row is gone once the current one is complete.
    const old = await fresh
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(eq(profilesTable.ownerTokenHash, demoOwnerPrefix(dorothy.key)));
    expect(old).toEqual([]);
  }, 60_000);
});
