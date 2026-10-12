import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  CreateProfileResponseSchema,
  ProfileListResponseSchema,
  ProfileResponseSchema,
  type ProfileInput,
} from "@memory-lane/shared";
import { createTestDb } from "../../test/pglite";
import { buildApp } from "../app";
import { hashOwnerToken } from "../auth/ownerToken";
import { purgeStaleData } from "../db/maintenance";
import { avoidItems, profiles, seeds } from "../db/schema";
import type { AppDb } from "../db/types";
import { createProfileStore, type ProfileStore } from "./store";

const INPUT: ProfileInput = {
  nickname: "Harjeet",
  birthYear: 1950,
  languages: ["Punjabi", "Hindi"],
  lifeStages: [{ region: "Amritsar, Punjab, India", fromYear: 1950, toYear: 1975 }],
  favourites: [
    { domain: "music", text: "Mohammed Rafi" },
    { domain: "film", text: "Mughal-e-Azam" },
  ],
  avoid: [{ text: "Partition memories", reason: "Painful for him" }],
};

let db: AppDb;
let store: ProfileStore;
let app: Awaited<ReturnType<typeof buildApp>> | undefined;

beforeAll(async () => {
  db = await createTestDb();
  store = createProfileStore(db);
}, 30_000);

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(opts: { store?: ProfileStore | null } = {}) {
  app = await buildApp({
    gateway: { capabilities: async () => ({ ok: true, state: "ok", message: "ready" }) },
    db: null,
    profiles: opts.store === undefined ? store : opts.store,
    version: "test",
    webOrigins: ["https://web.example"],
    clientIpHeader: "cf-connecting-ip",
    logger: false,
  });
  return app;
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
let ipCounter = 0;
const freshIp = () => ({ "cf-connecting-ip": `203.0.113.${++ipCounter}` });

async function create(
  a: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string> = {},
) {
  const res = await a.inject({
    method: "POST",
    url: "/api/profiles",
    payload: INPUT,
    headers: { ...freshIp(), ...headers },
  });
  return {
    res,
    body: res.statusCode === 201 ? CreateProfileResponseSchema.parse(res.json()) : null,
  };
}

describe("profile routes", () => {
  it("creates a profile, mints an owner token and stores only its hash", async () => {
    const a = await start();
    const { res, body } = await create(a);
    expect(res.statusCode).toBe(201);
    const token = body?.ownerToken ?? "";
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body?.profile).toMatchObject({ nickname: "Harjeet", birthYear: 1950, isDemo: false });
    expect(body?.profile.seeds.map((s) => [s.rawText, s.status])).toEqual([
      ["Mohammed Rafi", "pending"],
      ["Mughal-e-Azam", "pending"],
    ]);
    const [row] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, body?.profile.id ?? ""));
    expect(row?.ownerTokenHash).toBe(hashOwnerToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("reuses the caller's token and lists only their profiles", async () => {
    const a = await start();
    const first = await create(a);
    const token = first.body?.ownerToken ?? "";
    const second = await create(a, auth(token));
    expect(second.body?.ownerToken).toBeUndefined();
    await create(a); // someone else

    const list = ProfileListResponseSchema.parse(
      (await a.inject({ method: "GET", url: "/api/profiles", headers: auth(token) })).json(),
    );
    expect(list.profiles.map((p) => p.id).sort()).toEqual(
      [first.body?.profile.id, second.body?.profile.id].sort(),
    );
    expect((await a.inject({ method: "GET", url: "/api/profiles" })).json()).toEqual({
      profiles: [],
    });
  });

  it("never adopts a client-chosen token: unknown tokens get a fresh one", async () => {
    const a = await start();
    const chosen = "x".repeat(43);
    const res = await create(a, auth(chosen));
    expect(res.body?.ownerToken).toBeDefined();
    expect(res.body?.ownerToken).not.toBe(chosen);
  });

  it("shows a profile only to its owner (404 for everyone else)", async () => {
    const a = await start();
    const { body } = await create(a);
    const id = body?.profile.id ?? "";
    const mine = await a.inject({
      method: "GET",
      url: `/api/profiles/${id}`,
      headers: auth(body?.ownerToken ?? ""),
    });
    expect(ProfileResponseSchema.parse(mine.json())).toMatchObject({ isOwner: true });

    const strangerToken = (await create(a)).body?.ownerToken ?? "";
    expect(
      (await a.inject({ method: "GET", url: `/api/profiles/${id}`, headers: auth(strangerToken) }))
        .statusCode,
    ).toBe(404);
    expect((await a.inject({ method: "GET", url: `/api/profiles/${id}` })).statusCode).toBe(404);
    expect((await a.inject({ method: "GET", url: "/api/profiles/not-a-uuid" })).statusCode).toBe(
      404,
    );
    const malformed = await a.inject({
      method: "GET",
      url: `/api/profiles/${id}`,
      headers: { authorization: "Bearer short" },
    });
    expect(malformed.statusCode).toBe(404);
  });

  it("makes demo profiles public and undeletable", async () => {
    const a = await start();
    const demo = await store.create(
      {
        ...INPUT,
        nickname: "Dorothy",
        birthYear: 1946,
        lifeStages: [{ region: "Dayton, Ohio", fromYear: 1946, toYear: 1968 }],
      },
      // Not 64 hex chars, so no token can ever hash to it (security review S5).
      `demo:${randomUUID()}`,
      { isDemo: true },
    );
    const res = await a.inject({ method: "GET", url: `/api/profiles/${demo.id}` });
    const shown = ProfileResponseSchema.parse(res.json());
    expect(shown).toMatchObject({ isOwner: false, profile: { isDemo: true } });
    // The private "why" is never sent to non-owners (security review W3).
    expect(shown.profile.avoid.map((a) => a.reason)).toEqual([null]);
    const token = (await create(a)).body?.ownerToken ?? "";
    expect(
      (await a.inject({ method: "DELETE", url: `/api/profiles/${demo.id}`, headers: auth(token) }))
        .statusCode,
    ).toBe(404);
  });

  it("deletes a profile with its seeds and avoid items (docs/07 §2.8)", async () => {
    const a = await start();
    const { body } = await create(a);
    const id = body?.profile.id ?? "";
    const token = body?.ownerToken ?? "";
    const strangerToken = (await create(a)).body?.ownerToken ?? "";
    expect(
      (
        await a.inject({
          method: "DELETE",
          url: `/api/profiles/${id}`,
          headers: auth(strangerToken),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await a.inject({ method: "DELETE", url: `/api/profiles/${id}`, headers: auth(token) }))
        .statusCode,
    ).toBe(204);
    expect(
      (await a.inject({ method: "GET", url: `/api/profiles/${id}`, headers: auth(token) }))
        .statusCode,
    ).toBe(404);
    const left = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(seeds)
      .where(eq(seeds.profileId, id));
    expect(left[0]?.n).toBe(0);
    const leftAvoid = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(avoidItems)
      .where(eq(avoidItems.profileId, id));
    expect(leftAvoid[0]?.n).toBe(0);
  });

  it("explains invalid answers by field without echoing them", async () => {
    const a = await start();
    const res = await a.inject({
      method: "POST",
      url: "/api/profiles",
      headers: freshIp(),
      payload: {
        ...INPUT,
        nickname: "Dad <b>",
        favourites: [{ domain: "music", text: "call 98765 43210" }],
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.fields.map((f: { path: string }) => f.path)).toEqual([
      "nickname",
      "favourites.0.text",
    ]);
    expect(res.body).not.toMatch(/Dad <b>|98765/);

    const bad = await a.inject({
      method: "POST",
      url: "/api/profiles",
      headers: { ...freshIp(), "content-type": "application/json" },
      payload: '{"nickname": "secret-name",',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.body).not.toMatch(/secret-name/);
  });

  it("limits profile creation per client IP", async () => {
    const a = await start();
    const ip = { "cf-connecting-ip": "198.51.100.7" };
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await create(a, ip)).res.statusCode);
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
    expect((await create(a, { "cf-connecting-ip": "198.51.100.8" })).res.statusCode).toBe(201);
  });

  it("keys IPv6 clients by their /64", async () => {
    const a = await start();
    const codes: number[] = [];
    for (let i = 1; i <= 11; i++) {
      codes.push(
        (await create(a, { "cf-connecting-ip": `2001:db8:1:2::${i.toString(16)}` })).res.statusCode,
      );
    }
    expect(codes[10]).toBe(429);
  });

  it("caps profiles per device and per day (security review W2)", async () => {
    const small = createProfileStore(db, { perOwner: 2, perDay: 1000 });
    const a = await start({ store: small });
    const token = (await create(a)).body?.ownerToken ?? "";
    expect((await create(a, auth(token))).res.statusCode).toBe(201);
    const third = await create(a, auth(token));
    expect(third.res.statusCode).toBe(409);
    expect(third.res.json()).toMatchObject({ error: "profile_limit" });
    await a.close();

    const daily = createProfileStore(db, { perOwner: 20, perDay: 1 }, () => Date.UTC(2031, 0, 1));
    const b = await start({ store: daily });
    expect((await create(b)).res.statusCode).toBe(201);
    expect((await create(b)).res.statusCode).toBe(409);
  });

  it("marks profile responses as private and uncacheable", async () => {
    const a = await start();
    const res = await a.inject({
      method: "GET",
      url: "/api/profiles",
      headers: { origin: "https://web.example" },
    });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(String(res.headers.vary)).toMatch(/Authorization/);
  });

  it("rate-limits probing of unknown routes", async () => {
    const a = await start();
    let last = 0;
    for (let i = 0; i < 121; i++) {
      last = (
        await a.inject({
          method: "GET",
          url: "/nope",
          headers: { "cf-connecting-ip": "192.0.2.50" },
        })
      ).statusCode;
    }
    expect(last).toBe(429);
  });

  it("purges idle profiles but keeps demos (docs/07 §2.8)", async () => {
    const a = await start();
    const { body } = await create(a);
    const id = body?.profile.id ?? "";
    const demo = await store.create({ ...INPUT, nickname: "Margaret" }, `demo:${randomUUID()}`, {
      isDemo: true,
    });
    await db.update(profiles).set({ lastSeenAt: sql`now() - interval '100 days'` });
    const purged = await purgeStaleData(db, { profileRetentionDays: 90 });
    expect(purged.profiles).toBeGreaterThan(0);
    expect(await store.get(id, hashOwnerToken(body?.ownerToken ?? ""))).toBeNull();
    expect(await store.get(demo.id, null)).not.toBeNull();
  });

  it("answers 503 honestly when there is no database", async () => {
    const a = await start({ store: null });
    const res = await a.inject({
      method: "POST",
      url: "/api/profiles",
      payload: INPUT,
      headers: freshIp(),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "unavailable" });
  });

  it("allows the bearer header cross-origin", async () => {
    const a = await start();
    const pre = await a.inject({
      method: "OPTIONS",
      url: "/api/profiles",
      headers: {
        origin: "https://web.example",
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      },
    });
    expect(pre.headers["access-control-allow-headers"]).toMatch(/authorization/);
    expect(pre.headers["access-control-allow-methods"]).toMatch(/DELETE/);
  });
});
