import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/mcp/server.ts", "bin/pdf-forge.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  outDir: "dist",
  splitting: true,
});
