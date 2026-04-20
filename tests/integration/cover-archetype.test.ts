import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, copyFile, rm, stat, readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { renderPages } from "../../src/core/renderer";
import { SOCIAL_FORMAT_VALUES, getSocialViewport } from "../../src/core/social-presets";

// Read PNG IHDR chunk to validate actual rendered dimensions. The IHDR header
// is the first chunk after the 8-byte PNG signature; width/height are big-endian
// uint32 at offsets 16 and 20.
async function readPngSize(path: string): Promise<{ width: number; height: number }> {
  const buf = await readFile(path);
  if (buf.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`Not a valid PNG: ${path}`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

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

      const pngPath = join(output, "01-cover.png");
      const pngStat = await stat(pngPath);
      expect(pngStat.size).toBeGreaterThan(10_000);

      // Actual PNG dimensions must match the declared viewport at scale=1.
      // This is the contract that makes the whole social format valuable —
      // a regression swapping viewports would silently ship wrong aspect ratios.
      const viewport = getSocialViewport(fmt);
      const pngSize = await readPngSize(pngPath);
      expect(pngSize.width).toBe(viewport.width);
      expect(pngSize.height).toBe(viewport.height);
    }, 30_000);
  }
});
