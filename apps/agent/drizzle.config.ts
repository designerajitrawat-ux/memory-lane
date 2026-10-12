import { defineConfig } from "drizzle-kit";

// Generates SQL migrations only (`pnpm --filter @memory-lane/agent db:generate`); the agent applies
// them itself at startup, so no DATABASE_URL is needed here.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
