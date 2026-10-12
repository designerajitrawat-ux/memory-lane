import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** Any drizzle Postgres database (postgres.js in production, PGlite in tests). */
export type AppDb = PgDatabase<PgQueryResultHKT>;
