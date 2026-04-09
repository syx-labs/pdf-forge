/**
 * merge-pages.ts — CLI wrapper for core merger
 *
 * Usage:
 *   bun run scripts/merge-pages.ts <input-dir> [--output output.pdf]
 */

import { resolve } from "node:path";
import { mergePages } from "../src/core/merger";

const args = process.argv.slice(2);
let inputDir = "";
let outputPath = "./output.pdf";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output") {
    outputPath = args[++i];
    if (!outputPath) { console.error("Missing value for --output."); process.exit(1); }
  } else if (!arg.startsWith("--")) {
    inputDir = arg;
  }
}

if (!inputDir) {
  console.error("Usage: bun run scripts/merge-pages.ts <input-dir> [--output output.pdf]");
  process.exit(1);
}

try {
  const result = await mergePages({
    inputDir: resolve(inputDir),
    outputPath: resolve(outputPath),
  });
  console.log(`\nDone. Output: ${result.path} (${result.fileSize})`);
} catch (err) {
  console.error("Merge error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
