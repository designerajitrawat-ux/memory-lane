import { beforeAll, describe, expect, it } from "vitest";
import { DemoProfilesResponseSchema, SessionResponseSchema } from "@memory-lane/shared";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import findTagsFixture from "../../test/fixtures/synthetic/qloo_find_tags.json";
import recommendFixture from "../../test/fixtures/synthetic/qloo_recommend.json";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import type { AppDb } from "../db/types";
import { createProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import { createResolutionStore } from "../stage1/store";
import { createTasteStore } from "../stage2/store";
import { createSessionStore } from "../stage3/store";
import { ensureDemoProfiles } from "./seed";

// SYNTHETIC answers (not Qloo data): every describe matches, every recommend returns era films.
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
      expect(
        (await app.inject({ method: "GET", url: `/api/evidence/${evidenceId}` })).statusCode,
      ).toBe(200);
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

      // Never changeable by visitors.
      for (const [method, url, payload] of [
        ["POST", `/api/profiles/${id}/sessions`, undefined],
        ["POST", `/api/profiles/${id}/taste-profile`, undefined],
        ["POST", `/api/session-items/${second.session.items[0]?.id}/reaction`, { value: "sang" }],
        ["POST", `/api/sessions/${second.session.id}/complete`, undefined],
        ["DELETE", `/api/profiles/${id}`, undefined],
      ] as const) {
        const res = await app.inject({ method, url, ...(payload ? { payload } : {}) });
        expect([401, 404], url).toContain(res.statusCode);
      }
    } finally {
      await app.close();
    }
  });
});
