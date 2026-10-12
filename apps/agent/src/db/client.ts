import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import type { DbCheck } from "@memory-lane/shared";
import type { AppDb } from "./types";

/** What health needs. */
export interface Db {
  ping(): Promise<DbCheck>;
  close(): Promise<void>;
}

/** The real database: health + drizzle access for the stores + startup migrations. */
export interface Database extends Db {
  drizzle: AppDb;
  migrate(migrationsFolder: string): Promise<void>;
}

const PING_TIMEOUT_S = 3;

// libpq-only URL options. postgres.js forwards unknown query params to the server as startup
// settings, which Postgres rejects ("unrecognized configuration parameter"). Neon's default
// connection string includes channel_binding=require.
const LIBPQ_ONLY_PARAMS = ["channel_binding"];

export function normalizeDatabaseUrl(url: string): string {
  const u = new URL(url);
  for (const p of LIBPQ_ONLY_PARAMS) u.searchParams.delete(p);
  return u.toString();
}

/**
 * Returns null when DATABASE_URL is not set, so health can report "not configured" honestly.
 * With verifyTls the server certificate is checked (Neon's certs are publicly trusted); this
 * overrides a weaker `sslmode` in the URL.
 */
export function createDb(
  url: string | undefined,
  { verifyTls }: { verifyTls: boolean },
): Database | null {
  if (!url) return null;
  const client = postgres(normalizeDatabaseUrl(url), {
    ...(verifyTls ? { ssl: "verify-full" as const } : {}),
    max: 5,
    connect_timeout: PING_TIMEOUT_S,
    idle_timeout: 30,
    onnotice: () => {}, // migrations emit "already exists, skipping" notices
  });
  const db = drizzle(client);

  return {
    drizzle: db,
    migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
    async ping() {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          db.execute(sql`select 1`),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_S * 1000);
          }),
        ]);
        return { ok: true, state: "ok", message: "Database is reachable." };
      } catch {
        // Never surface the driver error: it can include host names or connection details.
        return { ok: false, state: "error", message: "Couldn't reach the database." };
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => client.end({ timeout: 5 }),
  };
}
