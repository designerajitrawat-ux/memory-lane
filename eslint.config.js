// ESLint config for the agent and shared packages. apps/web has its own (eslint-config-next).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "apps/web/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: globals.node },
    rules: {
      "no-console": "error",
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
