import { defineConfig } from "vitest/config";

// Several test files each start an in-process Postgres (PGlite) and migrate it; running all of them
// at once starves the machine (setup hooks timed out at 30 s). A few at a time is faster overall.
export default defineConfig({
  test: {
    maxWorkers: 3,
    hookTimeout: 60_000,
    // The judge-path tests seed three personas through the whole pipeline: allow for a busy machine.
    testTimeout: 30_000,
  },
});
