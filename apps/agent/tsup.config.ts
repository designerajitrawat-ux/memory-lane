import { defineConfig } from "tsup";

// Single self-contained file: every dependency (and @memory-lane/shared) is bundled in, so the
// runtime Docker stage needs only Node, the global Qloo harness and dist/server.cjs.
export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node22",
  // Everything except the dev-only in-process Postgres (db/devPglite.ts), which must never be part of
  // the production bundle (it stays a lazy require that only runs with DATABASE_URL=pglite:…).
  noExternal: [/^(?!@electric-sql\/pglite)/],
  external: ["@electric-sql/pglite"],
  outExtension: () => ({ js: ".cjs" }),
  sourcemap: true,
  clean: true,
});
