import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, copyFile, rm, readFile, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

let workDir: string;
let pagesDir: string;
let renderedDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "carousel-pipeline-"));
  pagesDir = join(workDir, "pages");
  renderedDir = join(workDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(pagesDir, { recursive: true });

  // Use 3 copies of cover/carousel-4-5 as a synthetic carousel
  const src = join(REPO_ROOT, "assets/templates/social/cover/carousel-4-5.html");
  await copyFile(src, join(pagesDir, "01-hook.html"));
  await copyFile(src, join(pagesDir, "02-middle.html"));
  await copyFile(src, join(pagesDir, "03-cta.html"));
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

    // 2. manifest
    await $`bun run ${REPO_ROOT}/scripts/generate-manifest.ts ${renderedDir} --format carousel-4-5 --theme dark-editorial --archetype cover,cover,cover`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("manifest.yaml");
    const manifest = await readFile(join(renderedDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("format: carousel-4-5");
    expect(manifest).toContain("theme: dark-editorial");
    expect(manifest).toContain("01-hook.png");
    expect(manifest).toContain("03-cta.png");

    // 3. preview
    await $`bun run ${REPO_ROOT}/scripts/generate-preview.ts ${renderedDir}`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("preview.html");
    const preview = await readFile(join(renderedDir, "preview.html"), "utf-8");
    expect(preview).toContain("01-hook.png");
    expect(preview).toContain("carousel-4-5");
    expect(preview).toContain("dark-editorial");
  }, 120_000);
});
