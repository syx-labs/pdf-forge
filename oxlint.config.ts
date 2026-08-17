import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".claude-plugin/**",
    "assets/**",
    "skills/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: "./tools/oxlint/anti-slop/index.ts",
    },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "warn",
    "anti-slop/no-known-value-widening": "warn",
    "anti-slop/no-widen-then-assert": "warn",
    "anti-slop/no-object-parameters": "warn",
    "anti-slop/require-safety-comment-for-type-assertion": "warn",
  },
});
