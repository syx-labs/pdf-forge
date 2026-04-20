/**
 * render-pdf.ts — CLI wrapper for core renderer
 *
 * Usage:
 *   bun run scripts/render-pdf.ts <input-dir> [--format slides|docs|social] [--social-format <preset>] [--output <dir>] [--scale 2]
 */

import { resolve } from "node:path";
import { renderPages } from "../src/core/renderer";
import type { Format, SocialFormat } from "../src/core/types";
import {
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "../src/core/social-presets";

const args = process.argv.slice(2);
let inputDir = "";
let format: Format | undefined;
let socialFormat: SocialFormat | undefined;
let outputDir = "./output";
let scale = 2;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (val !== "slides" && val !== "docs" && val !== "social") {
      console.error(
        `Invalid format "${val}". Use "slides", "docs", or "social".`
      );
      process.exit(1);
    }
    format = val;
  } else if (arg === "--social-format") {
    const val = args[++i];
    if (!isValidSocialFormat(val)) {
      console.error(
        `Invalid --social-format "${val}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
      process.exit(1);
    }
    socialFormat = val;
  } else if (arg === "--output") {
    outputDir = args[++i];
    if (!outputDir) {
      console.error("Missing value for --output.");
      process.exit(1);
    }
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
  console.error(
    "Usage: bun run scripts/render-pdf.ts <input-dir> [--format slides|docs|social] [--social-format <preset>] [--output <dir>] [--scale 2]"
  );
  process.exit(1);
}

try {
  const result = await renderPages({
    inputDir: resolve(inputDir),
    outputDir: resolve(outputDir),
    format,
    socialFormat,
    scale,
  });
  const suffix = result.socialFormat ? ` (${result.socialFormat})` : "";
  console.log(
    `\nRendered ${result.files.length} ${result.format}${suffix} files to ${resolve(outputDir)}`
  );
} catch (err) {
  console.error("Render error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
