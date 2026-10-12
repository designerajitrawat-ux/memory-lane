import { afterEach, describe, expect, it } from "vitest";
import { HealthResponseSchema, type DbCheck, type QlooCheck } from "@memory-lane/shared";
import { buildApp } from "./app";
import type { Db } from "./db/client";
import type { QlooGateway } from "./qloo/gateway";

const WEB = "https://memory-lane.example";
const qlooOk: QlooCheck = { ok: true, state: "ok", message: "Qloo is connected and ready." };
const dbOk: DbCheck = { ok: true, state: "ok", message: "Database is reachable." };

const gateway = (impl: () => Promise<QlooCheck>): Pick<QlooGateway, "capabilities"> => ({
  capabilities: impl,
});
const db = (impl: () => Promise<DbCheck>): Db => ({ ping: impl, close: async () => {} });

let app: Awaited<ReturnType<typeof buildApp>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  qloo: Pick<QlooGateway, "capabilities">,
  database: Db | null,
  trustProxyHops = 0,
) {
  app = await buildApp({
    gateway: qloo,
    db: database,
    version: "test",
    webOrigins: [WEB],
    trustProxyHops,
    logger: false,
  });
  return app;
}

describe("readiness cache", () => {
  it("shares one check between back-to-back requests", async () => {
    let calls = 0;
    const counting = gateway(async () => {
      calls++;
      return qlooOk;
    });
    const a = await start(
      counting,
      db(async () => dbOk),
    );
    await Promise.all([
      a.inject({ method: "GET", url: "/api/health" }),
      a.inject({ method: "GET", url: "/api/health" }),
    ]);
    await a.inject({ method: "GET", url: "/api/health" });
    expect(calls).toBe(1);
  });
});

describe("error handler", () => {
  it("never echoes raw error text in 5xx responses", async () => {
    const a = await start(
      gateway(async () => qlooOk),
      null,
    );
    a.get("/boom", async () => {
      throw new Error("connect ECONNREFUSED db-host.internal:5432 password=hunter2");
    });
    const res = await a.inject({ method: "GET", url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toMatch(/hunter2|db-host|ECONNREFUSED/);
  });
});

describe("trust proxy", () => {
  it("uses the address added by the one trusted proxy, ignoring spoofed entries", async () => {
    const a = await start(
      gateway(async () => qlooOk),
      null,
      1,
    );
    a.get("/ip", async (req) => ({ ip: req.ip }));
    const res = await a.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" },
    });
    expect(res.json()).toEqual({ ip: "203.0.113.9" });
  });

  it("ignores X-Forwarded-For entirely when no proxy is trusted", async () => {
    const a = await start(
      gateway(async () => qlooOk),
      null,
      0,
    );
    a.get("/ip", async (req) => ({ ip: req.ip }));
    const res = await a.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "10.0.0.1",
      headers: { "x-forwarded-for": "6.6.6.6" },
    });
    expect(res.json()).toEqual({ ip: "10.0.0.1" });
  });
});

async function getHealth(qloo: Pick<QlooGateway, "capabilities">, database: Db | null) {
  const res = await (await start(qloo, database)).inject({ method: "GET", url: "/api/health" });
  return { res, body: HealthResponseSchema.parse(res.json()) };
}

describe("GET /api/health", () => {
  it("returns 200 and status ok when Qloo and the DB are ready", async () => {
    const { res, body } = await getHealth(
      gateway(async () => qlooOk),
      db(async () => dbOk),
    );
    expect(res.statusCode).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.agent.ok).toBe(true);
  });

  it("returns 503 degraded while Qloo has no credential", async () => {
    const noKey: QlooCheck = { ok: false, state: "no_credential", message: "no key yet" };
    const { res, body } = await getHealth(
      gateway(async () => noKey),
      db(async () => dbOk),
    );
    expect(res.statusCode).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.qloo.state).toBe("no_credential");
  });

  it("reports not_configured when there is no database", async () => {
    const { body } = await getHealth(
      gateway(async () => qlooOk),
      null,
    );
    expect(body.checks.db).toMatchObject({ ok: false, state: "not_configured" });
  });

  it("turns thrown errors into safe messages", async () => {
    const boom = async (): Promise<never> => {
      throw new Error("password=hunter2 host=db.internal");
    };
    const { res, body } = await getHealth(gateway(boom), db(boom));
    expect(body.checks.qloo.state).toBe("unavailable");
    expect(body.checks.db.state).toBe("error");
    expect(res.body).not.toMatch(/hunter2|db\.internal/);
  });
});

describe("GET /api/health/live", () => {
  it("is always 200, even when dependencies are down", async () => {
    const down = async (): Promise<QlooCheck> => ({
      ok: false,
      state: "unavailable",
      message: "down",
    });
    const res = await (
      await start(gateway(down), null)
    ).inject({ method: "GET", url: "/api/health/live" });
    expect(res.statusCode).toBe(200);
  });
});

describe("security", () => {
  it("allows CORS only for the web origin", async () => {
    const a = await start(
      gateway(async () => qlooOk),
      null,
    );
    const allowed = await a.inject({
      method: "GET",
      url: "/api/health/live",
      headers: { origin: WEB },
    });
    const other = await a.inject({
      method: "GET",
      url: "/api/health/live",
      headers: { origin: "https://evil.example" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe(WEB);
    expect(other.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends security headers", async () => {
    const res = await (
      await start(
        gateway(async () => qlooOk),
        null,
      )
    ).inject({
      method: "GET",
      url: "/api/health/live",
    });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("rejects oversized request bodies", async () => {
    const res = await (
      await start(
        gateway(async () => qlooOk),
        null,
      )
    ).inject({
      method: "POST",
      url: "/api/health/live",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ x: "a".repeat(70 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });
});
