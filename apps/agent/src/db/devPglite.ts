import { sql } from "drizzle-orm";
import type { Database } from "./client";
import type { AppDb } from "./types";

/**
 * DEV ONLY (`DATABASE_URL=pglite:memory`): an in-process Postgres so the full app runs locally without
 * Neon or Docker. Data lives in memory and is gone on restart. Refused in production (env.ts); PGlite is
 * a devDependency and kept out of the production bundle (tsup `external`).
 */
export async function createDevPgliteDb(): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite();
  const db = drizzle(client);
  return {
    drizzle: db as unknown as AppDb,
    migrate: (migrationsFolder) => migrate(db, { migrationsFolder }),
    async ping() {
      try {
        await db.execute(sql`select 1`);
        return { ok: true, state: "ok", message: "Database is reachable (local dev database)." };
      } catch {
        return { ok: false, state: "error", message: "Couldn't reach the database." };
      }
    },
    close: () => client.close(),
  };
}
