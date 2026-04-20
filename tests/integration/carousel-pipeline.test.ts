import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

let workDir: string;
let pagesDir: string;
let renderedDir: string;

const makeCarousel45Slide = (headline: string) => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head><body data-social-format="carousel-4-5" class="m-0 p-0 bg-zinc-950 text-white">
<div class="w-[1080px] h-[1350px] flex items-center justify-center">
  <h1 class="text-6xl text-white font-bold">${headline}</h1>
</div>
</body></html>`;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "carousel-pipeline-"));
  pagesDir = join(workDir, "pages");
  renderedDir = join(workDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(pagesDir, { recursive: true });

  // Three slides with distinct headlines exercise filename-order stability
  // and per-slide archetype mapping — would mask bugs if all slides were identical.
  await writeFile(join(pagesDir, "01-hook.html"), makeCarousel45Slide("Hook"));
  await writeFile(join(pagesDir, "02-middle.html"), makeCarousel45Slide("Middle"));
  await writeFile(join(pagesDir, "03-cta.html"), makeCarousel45Slide("CTA"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("full social carousel pipeline", () => {
  test("render -> manifest -> preview produces all expected artifacts", async () => {
    // 1. render
    await $`bun run ${REPO_ROOT}/scripts/render-pdf.ts ${pagesDir} --format social --output ${renderedDir} --scale 1`.quiet();
    let files = await readdir(renderedDir);
    expect(files.filter((f) => f.endsWith(".png"))).toHaveLength(3);

    // 2. manifest with distinct archetypes per slide — positional mapping must be preserved
    await $`bun run ${REPO_ROOT}/scripts/generate-manifest.ts ${renderedDir} --format carousel-4-5 --theme dark-editorial --archetype cover,definition,cta`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("manifest.yaml");
    const manifest = await readFile(join(renderedDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("format: carousel-4-5");
    expect(manifest).toContain("theme: dark-editorial");
    // Positional archetype mapping: slide 1 → cover, slide 2 → definition, slide 3 → cta.
    // Assert adjacency (file + archetype on consecutive lines) to catch re-ordering bugs.
    expect(manifest).toMatch(/file:\s*01-hook\.png[\s\S]{0,80}archetype:\s*cover/);
    expect(manifest).toMatch(/file:\s*02-middle\.png[\s\S]{0,80}archetype:\s*definition/);
    expect(manifest).toMatch(/file:\s*03-cta\.png[\s\S]{0,80}archetype:\s*cta/);

    // 3. preview should surface each archetype next to its filename
    await $`bun run ${REPO_ROOT}/scripts/generate-preview.ts ${renderedDir}`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("preview.html");
    const preview = await readFile(join(renderedDir, "preview.html"), "utf-8");
    expect(preview).toContain("01-hook.png");
    expect(preview).toContain("02-middle.png");
    expect(preview).toContain("03-cta.png");
    expect(preview).toContain("carousel-4-5");
    expect(preview).toContain("dark-editorial");
    expect(preview).toContain("definition");
  }, 120_000);
});
