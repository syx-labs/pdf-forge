import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(REPO_ROOT, "bin/pdf-forge.ts");

let workDir: string;
let pagesDir: string;
let renderedDir: string;

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd: workDir,
    env: { ...process.env, PDF_FORGE_HOME: REPO_ROOT },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "pdf-forge-cli-smoke-"));
  pagesDir = join(workDir, "pages");
  renderedDir = join(workDir, "rendered");
  await mkdir(pagesDir);
  await writeFile(
    join(pagesDir, "01-smoke.html"),
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    :root { --tw-smoke: 1; }
    @page { size: A4; margin: 0; }
    html, body { margin: 0; width: 210mm; min-height: 297mm; background: #18181b; color: white; }
    .page { box-sizing: border-box; width: 210mm; min-height: 297mm; padding: 24mm; }
  </style>
</head>
<body><main class="page w-[210mm]"><h1>pdf-forge CLI smoke</h1></main></body>
</html>`
  );
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("pdf-forge CLI PDF smoke", () => {
  test("renders and merges a valid one-page PDF", async () => {
    const render = await runCli([
      "render",
      pagesDir,
      "--format",
      "docs",
      "--output",
      renderedDir,
      "--scale",
      "1",
    ]);
    expect(render.exitCode, render.stderr).toBe(0);

    const output = join(workDir, "smoke.pdf");
    const merge = await runCli(["merge", renderedDir, "--output", output]);
    expect(merge.exitCode, merge.stderr).toBe(0);

    const bytes = await readFile(output);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  }, 60_000);
});
