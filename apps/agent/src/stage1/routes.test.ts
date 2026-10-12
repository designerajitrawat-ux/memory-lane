import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CreateProfileResponseSchema,
  ResolveEventSchema,
  type ProfileInput,
  type ResolveEvent,
} from "@memory-lane/shared";
import authError from "../../test/fixtures/harness/qloo-auth-error.json";
import describeFixture from "../../test/fixtures/synthetic/qloo_describe.json";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import { qlooCalls, seedCandidates, seeds } from "../db/schema";
import type { AppDb } from "../db/types";
import { createProfileStore, type ProfileStore } from "../profiles/store";
import { createPgEvidenceStore } from "../qloo/evidence";
import { createQlooGateway } from "../qloo/gateway";
import type { McpToolResult, QlooMcpClient } from "../qloo/mcpClient";
import type { ResolveRouteDeps } from "./routes";
import { createResolutionStore } from "./store";

const INPUT: ProfileInput = {
  nickname: "Harjeet",
  birthYear: 1950,
  languages: ["Punjabi"],
  lifeStages: [{ region: "Amritsar, Punjab, India", fromYear: 1950, toYear: 1975 }],
  favourites: [
    { domain: "music", text: "Mohammed Rafi" },
    { domain: "film", text: "Mughal-e-Azam" },
  ],
  avoid: [],
};

const twoMatches = { structuredContent: describeFixture.structuredContent };
const empty = {
  structuredContent: {
    ...describeFixture.structuredContent,
    status: "empty",
    results: [],
    result_count: 0,
  },
};
const noKey = { isError: true, structuredContent: authError.structuredContent };
const upstreamDown = {
  isError: true,
  structuredContent: {
    ...authError.structuredContent,
    error: { ...authError.structuredContent.error, code: "QLOO_UPSTREAM", retryable: false },
  },
};

function scripted(...answers: McpToolResult[]): QlooMcpClient & { calls: number } {
  let i = 0;
  const mcp = {
    calls: 0,
    async callTool() {
      mcp.calls++;
      return answers[Math.min(i++, answers.length - 1)] as McpToolResult;
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

async function start(mcp: QlooMcpClient, limits?: ResolveRouteDeps["limits"]) {
  const gateway = createQlooGateway({
    mcp,
    evidence: createPgEvidenceStore(db),
    sleep: async () => {},
  });
  app = await buildApp({
    gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
    db: null,
    profiles,
    resolution: { profiles, resolutions: createResolutionStore(db), gateway, limits },
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

async function newProfile(a: Awaited<ReturnType<typeof buildApp>>, input: ProfileInput = INPUT) {
  const res = await a.inject({
    method: "POST",
    url: "/api/profiles",
    payload: input,
    headers: headers(),
  });
  const body = CreateProfileResponseSchema.parse(res.json());
  return {
    id: body.profile.id,
    token: body.ownerToken ?? "",
    seedIds: body.profile.seeds.map((s) => s.id),
  };
}

function events(body: string): ResolveEvent[] {
  return body
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => ResolveEventSchema.parse(JSON.parse(chunk.slice(6))));
}

async function resolve(a: Awaited<ReturnType<typeof buildApp>>, id: string, token: string) {
  const res = await a.inject({
    method: "POST",
    url: `/api/profiles/${id}/seeds/resolve`,
    headers: headers(token),
  });
  return { res, events: events(res.body) };
}

describe("Stage 1: resolve and confirm", () => {
  it("streams steps and stores candidates for the caregiver to choose from", async () => {
    const a = await start(scripted(twoMatches));
    const p = await newProfile(a);
    const { res, events: ev } = await resolve(a, p.id, p.token);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(res.headers["access-control-allow-origin"]).toBeUndefined(); // no Origin sent
    expect(ev.map((e) => e.type)).toEqual(["step", "result", "step", "result", "done"]);
    expect(ev[1]?.message).toBe("Found 2 possible matches for “Mohammed Rafi”.");
    const done = ev.at(-1);
    if (done?.type !== "done") throw new Error("no done event");
    expect(done.message).toBe("Done. 2 favourites need your choice.");
    expect(done.data.map((r) => r.status)).toEqual(["needs_input", "needs_input"]);
    expect(done.data[0]?.candidates.map((c) => c.name)).toEqual([
      "Example Artist A",
      "Example Artist A (tribute band)",
    ]);
    const evidence = await db.select().from(qlooCalls).where(eq(qlooCalls.profileId, p.id));
    expect(evidence).toHaveLength(2);
  });

  it("stops honestly without a Qloo key: seeds stay pending, no harness text", async () => {
    const mcp = scripted(noKey);
    const a = await start(mcp);
    const p = await newProfile(a);
    const { res, events: ev } = await resolve(a, p.id, p.token);
    expect(ev.map((e) => e.type)).toEqual(["step", "error", "done"]);
    expect(ev[1]).toMatchObject({ type: "error", problem: "qloo_not_connected" });
    expect(res.body).not.toMatch(/qloo setup|QLOO_API_KEY|MCP server/i);
    expect(mcp.calls).toBe(1);
    const rows = await db
      .select({ status: seeds.status })
      .from(seeds)
      .where(eq(seeds.profileId, p.id));
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("marks not-found and personal-looking favourites as unresolved without sending them", async () => {
    const mcp = scripted(empty);
    const a = await start(mcp);
    const p = await newProfile(a, {
      ...INPUT,
      favourites: [
        { domain: "music", text: "Songs for Harjeet" }, // nickname: refused by the PII guard
        { domain: "music", text: "Unknown Singer" },
      ],
    });
    const { events: ev } = await resolve(a, p.id, p.token);
    const results = ev.filter((e) => e.type === "result");
    expect(results.map((e) => (e.type === "result" ? e.data.status : ""))).toEqual([
      "unresolved",
      "unresolved",
    ]);
    expect(results[0]?.type === "result" && results[0].data.message).toMatch(
      /personal information/,
    );
    expect(mcp.calls).toBe(1); // only "Unknown Singer" reached Qloo

    // The reason survives a reload, on the confirm screen and on the profile page.
    const listed = await a.inject({
      method: "GET",
      url: `/api/profiles/${p.id}/seeds`,
      headers: headers(p.token),
    });
    expect(listed.json().resolutions.map((r: { note: string }) => r.note)).toEqual([
      "personal_info",
      "not_found",
    ]);
    expect(listed.json().resolutions[0].message).toMatch(/wasn't sent to Qloo/);
    const profile = await a.inject({
      method: "GET",
      url: `/api/profiles/${p.id}`,
      headers: headers(p.token),
    });
    expect(profile.json().profile.seeds[0].note).toBe("personal_info");
  });

  it("stops at the first failed lookup and keeps that favourite pending", async () => {
    const mcp = scripted(upstreamDown, twoMatches);
    const a = await start(mcp);
    const p = await newProfile(a);
    const { res, events: ev } = await resolve(a, p.id, p.token);
    expect(ev.map((e) => e.type)).toEqual(["step", "result", "error", "done"]);
    expect(ev[1]).toMatchObject({ data: { status: "pending", note: "lookup_failed" } });
    expect(ev[2]).toMatchObject({ type: "error", problem: "unavailable" });
    expect(res.body).not.toMatch(/QLOO_UPSTREAM|qloo setup/i);
    expect(mcp.calls).toBe(1); // the second favourite wasn't tried
  });

  it("runs one check per profile at a time", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const mcp = scripted(twoMatches);
    let waiting = false;
    const slow: QlooMcpClient = {
      async callTool(...args) {
        waiting = true;
        await gate;
        return mcp.callTool(...args);
      },
      close: async () => {},
    };
    const a = await start(slow);
    const p = await newProfile(a);
    const first = resolve(a, p.id, p.token);
    while (!waiting) await new Promise((r) => setTimeout(r, 5)); // first run is waiting on Qloo
    const second = await a.inject({
      method: "POST",
      url: `/api/profiles/${p.id}/seeds/resolve`,
      headers: headers(p.token),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("already_checking");
    release();
    const done = await first;
    expect(done.events.at(-1)?.type).toBe("done");
    const again = await resolve(a, p.id, p.token); // lock released
    expect(again.res.statusCode).toBe(200);
  });

  it("stops when the device has used its daily lookups", async () => {
    const mcp = scripted(twoMatches);
    const a = await start(mcp, { lookupsPerOwnerPerDay: 1 });
    const p = await newProfile(a);
    const { events: ev } = await resolve(a, p.id, p.token);
    expect(ev.map((e) => e.type)).toEqual(["step", "result", "error", "done"]);
    expect(ev[2]).toMatchObject({ type: "error", problem: "quota" });
    expect(mcp.calls).toBe(1);
  });

  it("keeps CORS and security headers on the stream for the web origin", async () => {
    const a = await start(scripted(noKey));
    const p = await newProfile(a);
    const res = await a.inject({
      method: "POST",
      url: `/api/profiles/${p.id}/seeds/resolve`,
      headers: { ...headers(p.token), origin: "https://web.example" },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("https://web.example");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(String(res.headers.vary)).toMatch(/Authorization/);
  });

  it("never lets a late lookup undo a confirmed choice", async () => {
    const store = createResolutionStore(db);
    const a = await start(scripted(twoMatches));
    const p = await newProfile(a);
    await resolve(a, p.id, p.token);
    const [first] = await store.resolutions(p.id);
    if (!first?.candidates[0]) throw new Error("no candidates");
    await store.confirm(p.id, [{ seedId: first.seedId, candidateId: first.candidates[0].id }]);
    await store.saveCandidates(
      first.seedId,
      [{ entityId: "late", name: "Late", entityType: null, year: null }],
      randomUUID(),
    );
    await store.markUnresolved(first.seedId, "not_found");
    const [row] = await db.select().from(seeds).where(eq(seeds.id, first.seedId));
    expect(row).toMatchObject({ status: "confirmed", displayName: "Example Artist A" });
  });

  it("confirms only candidates the agent offered for that seed", async () => {
    const a = await start(scripted(twoMatches));
    const p = await newProfile(a);
    await resolve(a, p.id, p.token);
    const listed = (
      await a.inject({
        method: "GET",
        url: `/api/profiles/${p.id}/seeds`,
        headers: headers(p.token),
      })
    ).json();
    const [first, second] = listed.resolutions;
    const foreign = await a.inject({
      method: "POST",
      url: `/api/profiles/${p.id}/seeds/confirm`,
      headers: headers(p.token),
      payload: { decisions: [{ seedId: first.seedId, candidateId: second.candidates[0].id }] },
    });
    expect(foreign.statusCode).toBe(409);

    const ok = await a.inject({
      method: "POST",
      url: `/api/profiles/${p.id}/seeds/confirm`,
      headers: headers(p.token),
      payload: {
        decisions: [
          { seedId: first.seedId, candidateId: first.candidates[0].id },
          { seedId: second.seedId, candidateId: null },
        ],
      },
    });
    expect(ok.statusCode).toBe(200);
    const rows = await db.select().from(seeds).where(eq(seeds.profileId, p.id));
    const confirmed = rows.find((r) => r.id === first.seedId);
    expect(confirmed).toMatchObject({ status: "confirmed", displayName: "Example Artist A" });
    expect(confirmed?.evidenceId).toBeTruthy();
    expect(rows.find((r) => r.id === second.seedId)?.status).toBe("rejected");
    const left = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(seedCandidates)
      .where(
        sql`${seedCandidates.seedId} in (${sql`${first.seedId}::uuid`}, ${sql`${second.seedId}::uuid`})`,
      );
    expect(left[0]?.n).toBe(0); // the unchosen matches are dropped
  });

  it("is owner-only", async () => {
    const a = await start(scripted(twoMatches));
    const p = await newProfile(a);
    const stranger = await newProfile(a);
    for (const [method, url] of [
      ["POST", `/api/profiles/${p.id}/seeds/resolve`],
      ["GET", `/api/profiles/${p.id}/seeds`],
      ["POST", `/api/profiles/${p.id}/seeds/confirm`],
    ] as const) {
      const res = await a.inject({
        method,
        url,
        headers: headers(stranger.token),
        ...(method === "POST" && url.endsWith("confirm")
          ? { payload: { decisions: [{ seedId: randomUUID(), candidateId: null }] } }
          : {}),
      });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it("deletes candidates and Qloo call records with the profile", async () => {
    const a = await start(scripted(twoMatches));
    const p = await newProfile(a);
    await resolve(a, p.id, p.token);
    await a.inject({ method: "DELETE", url: `/api/profiles/${p.id}`, headers: headers(p.token) });
    const calls = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(qlooCalls)
      .where(eq(qlooCalls.profileId, p.id));
    const cands = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(seedCandidates)
      .where(
        sql`${seedCandidates.seedId} in (${sql.join(
          p.seedIds.map((s) => sql`${s}::uuid`),
          sql`, `,
        )})`,
      );
    expect(calls[0]?.n).toBe(0);
    expect(cands[0]?.n).toBe(0);
  });
});
