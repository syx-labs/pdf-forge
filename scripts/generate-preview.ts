/**
 * generate-preview.ts — build preview.html grid for visual QA of social renders
 *
 * Usage:
 *   bun run scripts/generate-preview.ts <rendered-dir> [--output <path>]
 */

import { resolve, join, relative, dirname } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { load as yamlLoad } from "js-yaml";

interface ManifestShape {
  carousel?: {
    format?: string;
    theme?: string;
    generated_at?: string;
    slides?: Array<{ file?: string; archetype?: string; [extra: string]: unknown }>;
  };
  caption_suggestion?: string;
  hashtag_suggestion?: string[];
}

const args = process.argv.slice(2);
let renderedDir = "";
let outputPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output") {
    outputPath = args[++i];
  } else if (!arg.startsWith("--")) {
    renderedDir = arg;
  }
}

if (!renderedDir) {
  console.error("Usage: bun run scripts/generate-preview.ts <rendered-dir> [--output <path>]");
  process.exit(1);
}

const dir = resolve(renderedDir);
const finalOutput = outputPath ? resolve(outputPath) : join(dir, "preview.html");

const entries = await readdir(dir);
const pngs = entries.filter((f) => f.endsWith(".png")).sort();

if (pngs.length === 0) {
  console.error(`No .png files found in ${dir}`);
  process.exit(1);
}

let manifest: ManifestShape | null = null;
if (entries.includes("manifest.yaml")) {
  const raw = await readFile(join(dir, "manifest.yaml"), "utf-8");
  try {
    manifest = yamlLoad(raw) as ManifestShape;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Failed to parse ${join(dir, "manifest.yaml")}: ${msg}`);
    process.exit(1);
  }
}

const format = String(manifest?.carousel?.format ?? "unknown");
const theme = String(manifest?.carousel?.theme ?? "default");
const generatedAt = String(manifest?.carousel?.generated_at ?? new Date().toISOString());
const slideMeta = new Map<string, string>();
for (const slide of manifest?.carousel?.slides ?? []) {
  if (slide.file && slide.archetype) slideMeta.set(slide.file, slide.archetype);
}

const caption = manifest?.caption_suggestion ?? "";
const hashtags = manifest?.hashtag_suggestion ?? [];

const previewDir = dirname(finalOutput);
const pngsRelative = pngs.map((p) => relative(previewDir, join(dir, p)));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Encode path segments for a safe src attribute. Preserves / separators so
// relative paths stay valid, but escapes spaces, #, ?, etc. in filenames.
function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

const slideCards = pngs
  .map((file, i) => {
    const archetype = slideMeta.get(file) ?? "—";
    return `
      <figure class="slide">
        <div class="slide-index">${String(i + 1).padStart(2, "0")}/${String(pngs.length).padStart(2, "0")}</div>
        <img src="${escapeHtml(encodePath(pngsRelative[i]))}" alt="${escapeHtml(file)}" />
        <figcaption>
          <div class="filename">${escapeHtml(file)}</div>
          <div class="archetype">${escapeHtml(archetype)}</div>
        </figcaption>
      </figure>
    `;
  })
  .join("\n");

const hashtagBlock =
  hashtags.length > 0
    ? `<div class="hashtags">${hashtags.map((h) => `<span>${escapeHtml(h)}</span>`).join(" ")}</div>`
    : "";
const captionBlock = caption
  ? `<pre class="caption">${escapeHtml(caption)}</pre>`
  : "";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Preview — ${escapeHtml(format)}</title>
  <style>
    body { margin: 0; background: #09090b; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; padding: 48px; }
    header { margin-bottom: 48px; }
    h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
    .meta { color: #a1a1aa; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px; }
    .slide { margin: 0; background: #18181b; border-radius: 12px; overflow: hidden; position: relative; }
    .slide img { display: block; width: 100%; height: auto; }
    .slide-index { position: absolute; top: 12px; right: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: #a1a1aa; background: rgba(9,9,11,0.7); padding: 4px 8px; border-radius: 4px; }
    figcaption { padding: 12px 16px; }
    .filename { font-family: ui-monospace, monospace; font-size: 13px; color: #e4e4e7; }
    .archetype { font-size: 12px; color: #71717a; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .caption { background: #18181b; border-radius: 8px; padding: 16px; margin-top: 48px; white-space: pre-wrap; color: #d4d4d8; font-family: inherit; font-size: 14px; line-height: 1.6; }
    .hashtags { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
    .hashtags span { font-family: ui-monospace, monospace; font-size: 12px; background: #27272a; color: #a78bfa; padding: 4px 10px; border-radius: 100px; }
  </style>
</head>
<body>
  <header>
    <h1>Preview — ${escapeHtml(format)}</h1>
    <div class="meta">${pngs.length} slide${pngs.length === 1 ? "" : "s"} · theme: ${escapeHtml(theme)} · generated: ${escapeHtml(generatedAt)}</div>
  </header>
  <div class="grid">
    ${slideCards}
  </div>
  ${captionBlock}
  ${hashtagBlock}
</body>
</html>
`;

await writeFile(finalOutput, html, "utf-8");
console.log(`Wrote ${finalOutput}`);
