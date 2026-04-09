import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPages } from "../../src/core/renderer";

let tempDir: string;
let inputDir: string;
let outputDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-test-"));
  inputDir = join(tempDir, "input");
  outputDir = join(tempDir, "output");
  // Create the input directory
  const { mkdir } = await import("node:fs/promises");
  await mkdir(inputDir, { recursive: true });
  await writeFile(
    join(inputDir, "01-test.html"),
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="m-0 p-0 bg-zinc-950">
<div class="w-[1920px] h-[1080px] bg-zinc-950 flex items-center justify-center">
<h1 class="text-7xl text-white font-bold">Test</h1>
</div></body></html>`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("renderPages", () => {
  test("renders a slide HTML to PNG", async () => {
    const result = await renderPages({
      inputDir,
      outputDir,
      format: "slides",
      scale: 1,
    });
    expect(result.format).toBe("slides");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEndWith(".png");

    const { stat } = await import("node:fs/promises");
    const fileStat = await stat(result.files[0]);
    expect(fileStat.size).toBeGreaterThan(0);
  }, 30_000);
});
