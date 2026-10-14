import { defineConfig } from "vitest/config";

// Several test files each start an in-process Postgres (PGlite) and migrate it; running all of them
// at once starves the machine (setup hooks timed out at 30 s). A few at a time is faster overall.
export default defineConfig({
  test: {
    maxWorkers: 4,
    hookTimeout: 60_000,
  },
});
