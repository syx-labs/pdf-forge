import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(REPO_ROOT, "bin/pdf-forge.ts");
const SOURCE_FIXTURE = join(
  REPO_ROOT,
  "tests/fixtures/data/executive-report-snapshot.json"
);

let workDir: string;
let pagesDir: string;
let renderedDir: string;
let composeFixture: string;

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isUnknownRecord(value)) {
    throw new Error(`Expected ${label} to be a JSON object.`);
  }
  return value;
}

function sourceCliEnvironment(): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  environment.NODE_ENV = "production";
  delete environment.PDF_FORGE_HOME;
  return environment;
}

async function runCli(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd: workDir,
    env: sourceCliEnvironment(),
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
  composeFixture = join(workDir, "executive-report-snapshot.json");
  await mkdir(pagesDir);
  await copyFile(SOURCE_FIXTURE, composeFixture);
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

  test("lists and inspects the canonical registry from an external cwd", async () => {
    const listed = await runCli(["registry", "list", "--json"]);
    expect(listed.exitCode, listed.stderr).toBe(0);
    expect(listed.stderr).toBe("");
    const registry = parseJsonRecord(listed.stdout, "source registry list");
    expect(registry.version).toBe("1");
    if (!Array.isArray(registry.entries)) {
      throw new Error("Expected source registry entries to be an array.");
    }
    const ids = registry.entries.map((value, index) => {
      if (!isUnknownRecord(value) || typeof value.id !== "string") {
        throw new Error(`Expected source registry entry ${index} to have an ID.`);
      }
      return value.id;
    });
    expect(ids).toEqual(["data-table", "executive-report", "metric-card"]);

    const inspected = await runCli([
      "registry",
      "inspect",
      "executive-report",
      "--json",
    ]);
    expect(inspected.exitCode, inspected.stderr).toBe(0);
    expect(inspected.stderr).toBe("");
    const entry = parseJsonRecord(inspected.stdout, "source registry inspect");
    expect(entry).toEqual({
      id: "executive-report",
      kind: "block",
      version: "1.0.0",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
      template: "blocks/executive-report/template.html",
      schema: "blocks/executive-report/block.yaml",
    });
    if (typeof entry.template !== "string" || typeof entry.schema !== "string") {
      throw new Error("Expected source registry paths to be strings.");
    }
    expect(isAbsolute(entry.template)).toBe(false);
    expect(isAbsolute(entry.schema)).toBe(false);
    expect(`${listed.stdout}${listed.stderr}${inspected.stdout}${inspected.stderr}`).not.toContain(
      REPO_ROOT
    );
  }, 60_000);

  test("composes the canonical static fixture from an external cwd", async () => {
    const fixture = parseJsonRecord(
      await readFile(composeFixture, "utf-8"),
      "source compose fixture"
    );
    expect(fixture.providerId).toBe("static-json");
    const output = join(workDir, "source-executive-report.pdf");
    const receiptPath = join(workDir, "source-executive-report.receipt.json");
    const composed = await runCli([
      "compose",
      "executive-report",
      "--data",
      basename(composeFixture),
      "--theme",
      "ivory-editorial",
      "--output",
      basename(output),
      "--receipt",
      basename(receiptPath),
    ]);
    expect(composed.exitCode, composed.stderr).toBe(0);
    expect(composed.stderr).toBe("");

    const pdfBytes = await readFile(output);
    expect(new TextDecoder().decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

    const receiptText = await readFile(receiptPath, "utf-8");
    const receipt = parseJsonRecord(receiptText, "source compose receipt");
    expect(receipt.schemaVersion).toBe("1");
    expect(receipt.componentIds).toEqual([
      "data-table",
      "executive-report",
      "metric-card",
    ]);
    if (!isUnknownRecord(receipt.output)) {
      throw new Error("Expected source compose receipt output to be an object.");
    }
    expect(receipt.output.fileName).toBe(basename(output));
    expect(receipt.output.pageCount).toBe(pdf.getPageCount());
    for (const forbidden of [
      REPO_ROOT,
      workDir,
      composeFixture,
      "static-json",
      "providerId",
      "sourceRef",
      "North",
      "South",
      "Protect enterprise retention.",
      "Accelerate qualified pipeline.",
    ]) {
      expect(receiptText).not.toContain(forbidden);
    }
  }, 60_000);
});
