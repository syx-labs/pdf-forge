import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, copyFile, rm, stat, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { renderPages } from "../../src/core/renderer";
import { SOCIAL_FORMAT_VALUES, getSocialViewport } from "../../src/core/social-presets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cover-archetype-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("cover archetype renders for all 5 formats", () => {
  for (const fmt of SOCIAL_FORMAT_VALUES) {
    test(`cover/${fmt}.html renders to PNG with expected viewport`, async () => {
      const input = join(workDir, fmt);
      const output = join(workDir, `out-${fmt}`);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(input, { recursive: true });

      const src = join(REPO_ROOT, "assets/templates/social/cover", `${fmt}.html`);
      await copyFile(src, join(input, "01-cover.html"));

      const result = await renderPages({
        inputDir: input,
        outputDir: output,
        format: "social",
        scale: 1,
      });

      expect(result.socialFormat).toBe(fmt);
      expect(result.files).toHaveLength(1);

      const files = await readdir(output);
      expect(files).toContain("01-cover.png");

      const pngStat = await stat(join(output, "01-cover.png"));
      expect(pngStat.size).toBeGreaterThan(10_000);

      // viewport sanity: expected dimensions known from getSocialViewport
      const viewport = getSocialViewport(fmt);
      expect(viewport.width).toBe(1080);
      expect(viewport.height).toBeGreaterThan(0);
    }, 30_000);
  }
});
