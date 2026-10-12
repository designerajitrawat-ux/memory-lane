import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AppDb } from "../src/db/types";

const MIGRATIONS = fileURLToPath(new URL("../drizzle", import.meta.url));

/** In-process Postgres with the real migrations applied (no Docker, no Neon). */
export async function createTestDb(): Promise<AppDb> {
  const db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db as unknown as AppDb;
}
