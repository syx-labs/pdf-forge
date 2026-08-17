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
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
