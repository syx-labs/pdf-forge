import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(REPO_ROOT, "bin/pdf-forge.ts");

let tempDir: string;
let inputDir: string;
let outputDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-test-"));
  inputDir = join(tempDir, "input");
  outputDir = join(tempDir, "output");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(inputDir, { recursive: true });
  await writeFile(
    join(inputDir, "01-test.html"),
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>:root { --tw-test: 1; }</style>
</head><body class="m-0 p-0 bg-zinc-950">
<div class="w-[1920px] h-[1080px] bg-zinc-950 flex items-center justify-center">
<h1 class="text-7xl text-white font-bold">Test</h1>
</div></body></html>`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("pdf-forge CLI slide render", () => {
  test("renders a slide HTML to PNG", async () => {
    // Run the stable CLI in a child process. Besides covering the public entry
    // point, this prevents Bun's test worker from reusing Playwright pipe file
    // descriptors after other browser-heavy test files.
    const proc = Bun.spawn(
      [
        process.execPath,
        "run",
        CLI,
        "render",
        inputDir,
        "--format",
        "slides",
        "--output",
        outputDir,
        "--scale",
        "1",
      ],
      {
        cwd: tempDir,
        env: { ...process.env, PDF_FORGE_HOME: REPO_ROOT },
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [exitCode, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stderr).text(),
    ]);
    expect(exitCode, stderr).toBe(0);

    const { stat } = await import("node:fs/promises");
    const outputPath = join(outputDir, "01-test.png");
    const fileStat = await stat(outputPath);
    expect(fileStat.size).toBeGreaterThan(0);
  }, 30_000);
});
