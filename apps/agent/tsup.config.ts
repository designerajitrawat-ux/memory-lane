import { defineConfig } from "tsup";

// Single self-contained file: every dependency (and @memory-lane/shared) is bundled in, so the
// runtime Docker stage needs only Node, the global Qloo harness and dist/server.cjs.
export default defineConfig({
  entry: { server: "src/server.ts" },
  format: ["cjs"],
  platform: "node",
  target: "node22",
  noExternal: [/.*/],
  outExtension: () => ({ js: ".cjs" }),
  sourcemap: true,
  clean: true,
});
