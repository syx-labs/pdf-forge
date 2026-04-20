/**
 * generate-manifest.ts — build manifest.yaml for a social render output
 *
 * Usage:
 *   bun run scripts/generate-manifest.ts <rendered-dir> --format <social-format> [--archetype cover,definition,steps,quote,cta] [--theme <name>] [--caption <text>] [--hashtags tag1,tag2]
 *
 * Archetype names go into the manifest as-is; they are not validated against
 * shipped templates (only `cover` ships today — the rest land in follow-up).
 * If --archetype is passed, its comma-separated count must match the PNG count.
 */

import { resolve, join } from "node:path";
import { readdir } from "node:fs/promises";
import { writeManifest, type ManifestSlide } from "../src/core/manifest";
import {
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "../src/core/social-presets";
import type { SocialFormat } from "../src/core/types";

const args = process.argv.slice(2);
let renderedDir = "";
let format: SocialFormat | undefined;
let archetypes: string[] = [];
let theme: string | undefined;
let caption: string | undefined;
let hashtags: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (!isValidSocialFormat(val)) {
      console.error(
        `Invalid --format "${val}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
      process.exit(1);
    }
    format = val;
  } else if (arg === "--archetype") {
    archetypes = args[++i].split(",").map((a) => a.trim()).filter(Boolean);
  } else if (arg === "--theme") {
    theme = args[++i];
  } else if (arg === "--caption") {
    caption = args[++i];
  } else if (arg === "--hashtags") {
    hashtags = args[++i].split(",").map((h) => h.trim()).filter(Boolean);
  } else if (!arg.startsWith("--")) {
    renderedDir = arg;
  }
}

if (!renderedDir || !format) {
  console.error(
    "Usage: bun run scripts/generate-manifest.ts <rendered-dir> --format <social-format> [options]"
  );
  process.exit(1);
}

const resolvedDir = resolve(renderedDir);
const entries = await readdir(resolvedDir);
const pngs = entries.filter((f) => f.endsWith(".png")).sort();

if (pngs.length === 0) {
  console.error(`No .png files found in ${resolvedDir}`);
  process.exit(1);
}

if (archetypes.length > 0 && archetypes.length !== pngs.length) {
  console.error(
    `Archetype count mismatch: --archetype has ${archetypes.length} entries but ${pngs.length} PNGs in ${resolvedDir}. Pass one archetype per slide.`
  );
  process.exit(1);
}

const slides: ManifestSlide[] = pngs.map((file, i) => ({
  file,
  archetype: archetypes[i] ?? "unknown",
}));

const outputPath = join(resolvedDir, "manifest.yaml");
await writeManifest({
  outputPath,
  format,
  theme,
  slides,
  caption,
  hashtags,
});
console.log(`Wrote ${outputPath}`);
