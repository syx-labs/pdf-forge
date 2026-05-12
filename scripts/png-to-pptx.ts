/**
 * png-to-pptx.ts — Build a full-bleed PPTX from rendered slide PNGs.
 *
 * Uses python-pptx via `uv run` (the only mature library for this).
 * Requires `uv` (https://docs.astral.sh/uv/) on PATH.
 *
 * Usage:
 *   bun run scripts/png-to-pptx.ts <rendered-dir> [--output deck.pptx] [--aspect 16:9|4:3|16:10] [--width <in>] [--height <in>]
 *
 * Defaults: aspect 16:9 (13.333 × 7.5 in), output ./output.pptx.
 */

import { resolve, basename } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";

const ASPECT_PRESETS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 13.333, height: 7.5 },
  "4:3": { width: 10, height: 7.5 },
  "16:10": { width: 13.333, height: 8.333 },
  "a4-landscape": { width: 11.69, height: 8.27 },
  "a4-portrait": { width: 8.27, height: 11.69 },
};

const ASPECT_KEYS = Object.keys(ASPECT_PRESETS);

const args = process.argv.slice(2);
let renderedDir = "";
let outputPath = "./output.pptx";
let aspect = "16:9";
let widthOverride: number | undefined;
let heightOverride: number | undefined;

function requireNext(flag: string, value: string | undefined): string {
  if (value === undefined || value.startsWith("--")) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return value;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output" || arg === "-o") {
    outputPath = requireNext(arg, args[++i]);
  } else if (arg === "--aspect") {
    aspect = requireNext(arg, args[++i]);
    if (!ASPECT_PRESETS[aspect]) {
      console.error(
        `Invalid --aspect "${aspect}". Valid: ${ASPECT_KEYS.join(", ")}.`
      );
      process.exit(1);
    }
  } else if (arg === "--width") {
    widthOverride = parseFloat(requireNext(arg, args[++i]));
    if (isNaN(widthOverride) || widthOverride <= 0) {
      console.error("--width must be a positive number (inches).");
      process.exit(1);
    }
  } else if (arg === "--height") {
    heightOverride = parseFloat(requireNext(arg, args[++i]));
    if (isNaN(heightOverride) || heightOverride <= 0) {
      console.error("--height must be a positive number (inches).");
      process.exit(1);
    }
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "Usage: bun run scripts/png-to-pptx.ts <rendered-dir> [--output deck.pptx] [--aspect 16:9] [--width <in>] [--height <in>]"
    );
    console.log(`Aspects: ${ASPECT_KEYS.join(", ")}`);
    process.exit(0);
  } else if (!arg.startsWith("--")) {
    renderedDir = arg;
  }
}

if (!renderedDir) {
  console.error(
    "Usage: bun run scripts/png-to-pptx.ts <rendered-dir> [--output deck.pptx] [--aspect 16:9]"
  );
  process.exit(1);
}

const renderedAbs = resolve(renderedDir);
const outputAbs = resolve(outputPath);

const s = await stat(renderedAbs).catch(() => null);
if (!s || !s.isDirectory()) {
  console.error(`"${renderedAbs}" is not a directory.`);
  process.exit(1);
}

const pngFiles = (await readdir(renderedAbs))
  .filter((f) => f.toLowerCase().endsWith(".png"))
  .sort();

if (pngFiles.length === 0) {
  console.error(`No .png files in "${renderedAbs}".`);
  process.exit(1);
}

const dim = ASPECT_PRESETS[aspect];
const widthIn = widthOverride ?? dim.width;
const heightIn = heightOverride ?? dim.height;

// EMU = inches × 914400
const widthEmu = Math.round(widthIn * 914400);
const heightEmu = Math.round(heightIn * 914400);

const pythonScript = `
from pathlib import Path
from pptx import Presentation
from pptx.util import Emu
import sys, json

cfg = json.loads(sys.stdin.read())
prs = Presentation()
prs.slide_width = Emu(cfg["width_emu"])
prs.slide_height = Emu(cfg["height_emu"])
blank_layout = prs.slide_layouts[6]

for png_path in cfg["pngs"]:
    slide = prs.slides.add_slide(blank_layout)
    slide.shapes.add_picture(
        png_path, 0, 0,
        width=Emu(cfg["width_emu"]),
        height=Emu(cfg["height_emu"]),
    )

prs.save(cfg["output"])
print(json.dumps({"path": cfg["output"], "slides": len(cfg["pngs"])}))
`.trim();

const payload = JSON.stringify({
  width_emu: widthEmu,
  height_emu: heightEmu,
  pngs: pngFiles.map((f) => resolve(renderedAbs, f)),
  output: outputAbs,
});

console.log(`Building PPTX (${aspect}, ${widthIn}×${heightIn} in) from ${pngFiles.length} PNG(s)...`);

const child = spawn("uv", ["run", "--with", "python-pptx", "python", "-c", pythonScript], {
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.stdin.write(payload);
child.stdin.end();

const exitInfo: { code: number; spawnError?: Error } = await new Promise(
  (res) => {
    child.on("close", (c) => res({ code: c ?? 1 }));
    child.on("error", (err) => res({ code: 1, spawnError: err }));
  }
);

if (exitInfo.spawnError) {
  console.error(
    `Failed to spawn \`uv\`: ${exitInfo.spawnError.message}. Install uv from https://docs.astral.sh/uv/.`
  );
  process.exit(1);
}

if (exitInfo.code !== 0) {
  console.error(`python-pptx failed (exit ${exitInfo.code}). Is \`uv\` installed?`);
  process.exit(exitInfo.code);
}

try {
  const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
  console.log(`\nSaved: ${parsed.path}`);
  console.log(`Slides embedded: ${parsed.slides}`);
} catch {
  console.log(stdout);
}

console.log(`\nFile: ${basename(outputAbs)}`);
