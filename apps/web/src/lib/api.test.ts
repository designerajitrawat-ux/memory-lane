import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { getOwnerToken } from "./owner-token";

const PROFILE = {
  id: "00000000-0000-4000-8000-000000000001",
  nickname: null,
  birthYear: 1950,
  languages: ["Hindi"],
  lifeStages: [{ region: "Delhi, India", fromYear: 1950, toYear: 1970 }],
  seeds: [],
  avoid: [],
  isDemo: false,
  createdAt: "2026-10-12T10:00:00.000Z",
};

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("stores a newly minted owner token and sends it afterwards", async () => {
    const token = "a".repeat(43);
    vi.stubGlobal("fetch", respond(201, { profile: PROFILE, ownerToken: token }));
    const created = await api.createProfile({} as never);
    expect(created.ok).toBe(true);
    expect(getOwnerToken()).toBe(token); // memory fallback: no localStorage in this test runtime

    const fetchMock = respond(200, { profiles: [] });
    vi.stubGlobal("fetch", fetchMock);
    await api.listProfiles();
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${token}`);
  });

  it("maps failures to kinds with kind words, keeping field paths", async () => {
    vi.stubGlobal(
      "fetch",
      respond(400, {
        error: "invalid_profile",
        message: "x",
        fields: [{ path: "birthYear", message: "Please enter a year like 1950." }],
      }),
    );
    expect(await api.createProfile({} as never)).toMatchObject({
      ok: false,
      kind: "invalid",
      fields: [{ path: "birthYear" }],
    });
    vi.stubGlobal("fetch", respond(404, { error: "not_found", message: "x" }));
    expect(await api.getProfile("x")).toMatchObject({ ok: false, kind: "not_found" });
    vi.stubGlobal("fetch", respond(429, { error: "rate_limited", message: "x" }));
    expect(await api.listProfiles()).toMatchObject({ ok: false, kind: "rate_limited" });
    vi.stubGlobal("fetch", respond(503, { error: "unavailable", message: "x" }));
    expect(await api.listProfiles()).toMatchObject({ ok: false, kind: "unavailable" });
  });

  it("treats network errors and unexpected bodies honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    expect(await api.listProfiles()).toMatchObject({ ok: false, kind: "unreachable" });
    vi.stubGlobal("fetch", respond(200, { unexpected: true }));
    expect(await api.listProfiles()).toMatchObject({ ok: false, kind: "server" });
    vi.stubGlobal("fetch", respond(204, undefined));
    expect(await api.deleteProfile(PROFILE.id)).toEqual({ ok: true, data: undefined });
  });
});
