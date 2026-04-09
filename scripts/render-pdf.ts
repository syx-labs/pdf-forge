/**
 * render-pdf.ts — CLI wrapper for core renderer
 *
 * Usage:
 *   bun run scripts/render-pdf.ts <input-dir> [--format slides|docs] [--output <dir>] [--scale 2]
 */

import { resolve } from "node:path";
import { renderPages } from "../src/core/renderer";
import type { Format } from "../src/core/types";

const args = process.argv.slice(2);
let inputDir = "";
let format: Format | undefined;
let outputDir = "./output";
let scale = 2;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (val !== "slides" && val !== "docs") {
      console.error(`Invalid format "${val}". Use "slides" or "docs".`);
      process.exit(1);
    }
    format = val;
  } else if (arg === "--output") {
    outputDir = args[++i];
    if (!outputDir) { console.error("Missing value for --output."); process.exit(1); }
  } else if (arg === "--scale") {
    scale = parseInt(args[++i], 10);
    if (isNaN(scale) || scale < 1 || scale > 4) {
      console.error("Scale must be 1-4. Default: 2.");
      process.exit(1);
    }
  } else if (!arg.startsWith("--")) {
    inputDir = arg;
  }
}

if (!inputDir) {
  console.error("Usage: bun run scripts/render-pdf.ts <input-dir> [--format slides|docs] [--output <dir>] [--scale 2]");
  process.exit(1);
}

try {
  const result = await renderPages({
    inputDir: resolve(inputDir),
    outputDir: resolve(outputDir),
    format,
    scale,
  });
  console.log(`\nRendered ${result.files.length} ${result.format} files to ${resolve(outputDir)}`);
} catch (err) {
  console.error("Render error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
