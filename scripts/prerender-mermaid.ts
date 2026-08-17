/**
 * prerender-mermaid.ts — renders mermaid diagrams to static SVG files.
 *
 * The doc renderer only awaits Tailwind + document.fonts.ready — it never waits
 * for async scripts, so mermaid must be pre-rendered and the SVG inlined into
 * the page (see assets/templates/documents/ivory-editorial/diagram-page.html).
 *
 * Gotcha this script solves: mermaid measures text with whatever font is loaded
 * at render time. Without loading the real font first, boxes are sized for the
 * Chromium default font and labels get clipped in the final PDF. We load the
 * manifest's font and await document.fonts.ready BEFORE mermaid.render.
 *
 * Usage:
 *   bun run scripts/prerender-mermaid.ts <manifest.yaml> [--output <dir>]
 *
 * Manifest shape (see mermaid-manifest.example.yaml):
 *   font: { family, url }        # Google Fonts family used by the target pages
 *   theme_variables: { ... }     # mermaid themeVariables (theme "base")
 *   diagrams: { name: definition, ... }
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

interface MermaidManifest {
  font: { family: string; url: string };
  theme_variables: Record<string, string>;
  diagrams: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringDictionary(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isValidManifest(value: unknown): value is MermaidManifest {
  if (!isRecord(value) || !isRecord(value.font)) return false;
  return (
    typeof value.font.family === "string" &&
    typeof value.font.url === "string" &&
    isStringDictionary(value.theme_variables) &&
    isStringDictionary(value.diagrams)
  );
}

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith("--"));
const outFlag = args.indexOf("--output");
const outDir = outFlag !== -1 ? args[outFlag + 1] : undefined;

if (!manifestPath || !outDir) {
  console.error("usage: prerender-mermaid.ts <manifest.yaml> --output <dir>");
  process.exit(2);
}

const parsed: unknown = load(readFileSync(manifestPath, "utf-8"));
if (!isValidManifest(parsed)) {
  console.error(
    `invalid manifest: expected { font: { family, url }, theme_variables: {...}, diagrams: { name: definition } }`
  );
  process.exit(2);
}
const manifest = parsed;
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // Load the real font BEFORE mermaid measures text (see header comment).
  await page.setContent(
    `<!DOCTYPE html><html><head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
      <link href="${manifest.font.url}" rel="stylesheet" />
      <style>body{font-family:'${manifest.font.family}',sans-serif}</style>
    </head><body><span style="font-family:'${manifest.font.family}'">aferição</span></body></html>`,
    { waitUntil: "networkidle" }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({
    url: "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js",
  });

  const svgs = await page.evaluate(
    async ({ defs, vars }) => {
      const mermaid: unknown = Reflect.get(window, "mermaid");
      if (
        typeof mermaid !== "object" ||
        mermaid === null ||
        !("initialize" in mermaid) ||
        typeof mermaid.initialize !== "function" ||
        !("render" in mermaid) ||
        typeof mermaid.render !== "function"
      ) {
        throw new Error("Mermaid script did not expose initialize() and render().");
      }
      mermaid.initialize({ startOnLoad: false, theme: "base", themeVariables: vars });
      const out: Record<string, string> = {};
      for (const [name, definition] of Object.entries(defs)) {
        const rendered: unknown = await mermaid.render(`prerender_${name}`, definition);
        if (
          typeof rendered !== "object" ||
          rendered === null ||
          !("svg" in rendered) ||
          typeof rendered.svg !== "string"
        ) {
          throw new Error(`Mermaid returned an invalid SVG for diagram "${name}".`);
        }
        out[name] = rendered.svg;
      }
      return out;
    },
    { defs: manifest.diagrams, vars: manifest.theme_variables }
  );

  for (const [name, svg] of Object.entries(svgs)) {
    const path = join(outDir, `${name}.svg`);
    writeFileSync(path, svg, "utf-8");
    console.log(`${path}: ${svg.length} bytes`);
  }
} finally {
  await browser.close();
}
