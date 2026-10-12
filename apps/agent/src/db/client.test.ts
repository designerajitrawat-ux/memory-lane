import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "./client";

describe("normalizeDatabaseUrl", () => {
  it("drops libpq-only params that postgres.js would send to the server", () => {
    const url = normalizeDatabaseUrl(
      "postgresql://user:pw@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    );
    expect(url).toBe("postgresql://user:pw@ep-x.us-east-1.aws.neon.tech/neondb?sslmode=require");
  });

  it("leaves a plain URL unchanged", () => {
    expect(normalizeDatabaseUrl("postgres://u:p@localhost:5432/db")).toBe(
      "postgres://u:p@localhost:5432/db",
    );
  });
});
