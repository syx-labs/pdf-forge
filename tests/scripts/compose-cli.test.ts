import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { hashDataSnapshot } from "../../src/data/canonicalize";
import { redactDataSnapshot } from "../../src/data/redact";
import { parseDataSnapshot } from "../../src/data/schemas";

const PACKAGE_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(PACKAGE_ROOT, "bin/pdf-forge.ts");
const SOURCE_FIXTURE = join(
  PACKAGE_ROOT,
  "tests/fixtures/data/executive-report-snapshot.json"
);
const temporaryRoots: string[] = [];

async function makeExternalCwd(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-compose-cli-"));
  temporaryRoots.push(root);
  return root;
}

async function copyFixtureToExternalCwd(cwd: string): Promise<string> {
  const relativePath = "data/executive-report.json";
  const destination = join(cwd, relativePath);
  await mkdir(join(cwd, "data"), { recursive: true });
  await copyFile(SOURCE_FIXTURE, destination);
  return relativePath;
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

async function runCli(
  cwd: string,
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd,
    env: {
      HOME: process.env.HOME ?? tmpdir(),
      PATH: process.env.PATH ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
    },
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

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("pdf-forge compose CLI", () => {
  test("composes a relative static snapshot from an external cwd into a verified PDF and redacted receipt", async () => {
    const externalCwd = await makeExternalCwd();
    const dataPath = join(externalCwd, "data/executive-report.json");
    const relativeDataPath = "data/executive-report.json";
    const relativeOutputPath = "artifacts/executive-report.pdf";
    const relativeReceiptPath = "artifacts/executive-report.receipt.json";
    const outputPath = join(externalCwd, relativeOutputPath);
    const receiptPath = join(externalCwd, relativeReceiptPath);
    const sourceFixtureBefore = await readFile(SOURCE_FIXTURE);
    await mkdir(join(externalCwd, "data"), { recursive: true });
    await copyFile(SOURCE_FIXTURE, dataPath);

    const result = await runCli(externalCwd, [
      "compose",
      "executive-report",
      "--receipt",
      relativeReceiptPath,
      "--data",
      relativeDataPath,
      "--output",
      relativeOutputPath,
      "--theme",
      "ivory-editorial",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Created executive-report PDF");
    expect(result.stdout).toContain(basename(outputPath));
    expect(result.stdout).toContain(basename(receiptPath));
    expect(result.stdout).not.toContain(PACKAGE_ROOT);

    const pdfBytes = await readFile(outputPath);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

    const receiptText = await readFile(receiptPath, "utf8");
    expect(receiptText.endsWith("\n")).toBe(true);
    const receipt = JSON.parse(receiptText);
    const actualPdfSha256 = createHash("sha256")
      .update(pdfBytes)
      .digest("hex");
    const snapshot = parseDataSnapshot(
      JSON.parse(await readFile(dataPath, "utf8"))
    );
    const redacted = redactDataSnapshot(snapshot, {
      mode: "allow",
      columns: ["region", "revenue", "target", "recommendation"],
    });

    expect(receipt).toEqual({
      schemaVersion: "1",
      documentId: "executive-report",
      format: "docs",
      theme: "ivory-editorial",
      registryVersion: "1",
      componentIds: ["data-table", "executive-report", "metric-card"],
      componentVersions: {
        "data-table": "1.0.0",
        "executive-report": "1.0.0",
        "metric-card": "1.0.0",
      },
      snapshotSha256: hashDataSnapshot(redacted),
      output: {
        fileName: basename(outputPath),
        byteLength: pdfBytes.byteLength,
        pageCount: pdf.getPageCount(),
        sha256: actualPdfSha256,
      },
      warnings: [],
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u),
    });

    for (const forbidden of [
      "static-json",
      snapshot.sourceRef,
      dataPath,
      relativeDataPath,
      "North",
      "South",
      "Protect enterprise retention.",
      "Accelerate qualified pipeline.",
      '"rows"',
      '"providerId"',
      '"sourceRef"',
      '"filePath"',
    ]) {
      expect(receiptText).not.toContain(forbidden);
    }
    expect(await readFile(SOURCE_FIXTURE)).toEqual(sourceFixtureBefore);
  }, 60_000);

  test("documents compose in root and nested help without exposing the package root", async () => {
    const externalCwd = await makeExternalCwd();
    const rootHelp = await runCli(externalCwd, ["--help"]);
    const composeHelp = await runCli(externalCwd, ["compose", "--help"]);
    const blockHelp = await runCli(externalCwd, [
      "compose",
      "executive-report",
      "--help",
    ]);

    for (const result of [rootHelp, composeHelp, blockHelp]) {
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(`${result.stdout}${result.stderr}`).not.toContain(PACKAGE_ROOT);
    }
    expect(rootHelp.stdout).toContain("pdf-forge compose executive-report");
    expect(composeHelp.stdout).toContain(
      "pdf-forge compose executive-report --data <path> --theme <id> --output <pdf> --receipt <json>"
    );
    expect(blockHelp.stdout).toBe(composeHelp.stdout);
  });

  test("rejects unknown, duplicate, missing and extra arguments with exit code 2 and usage", async () => {
    const externalCwd = await makeExternalCwd();
    const valid = [
      "compose",
      "executive-report",
      "--data",
      "data.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "output.pdf",
      "--receipt",
      "receipt.json",
    ];
    const invalidCases = [
      ["compose"],
      ["compose", "executive-report"],
      [...valid, "extra"],
      [...valid, "--unknown", "value"],
      [...valid, "--data", "second.json"],
      valid.filter((argument) => argument !== "--receipt" && argument !== "receipt.json"),
      [
        "compose",
        "executive-report",
        "--data",
        "--theme",
        "ivory-editorial",
        "--output",
        "output.pdf",
        "--receipt",
        "receipt.json",
      ],
      [
        "compose",
        "executive-report",
        "--data",
        "data.json",
        "--theme",
        "ivory-editorial",
        "--output",
        "same-path",
        "--receipt",
        "./same-path",
      ],
    ];

    for (const args of invalidCases) {
      const result = await runCli(externalCwd, args);
      expect(result.exitCode, args.join(" ")).toBe(2);
      expect(result.stdout, args.join(" ")).toBe("");
      expect(result.stderr, args.join(" ")).toContain("Usage:");
      expect(result.stderr, args.join(" ")).toContain(
        "pdf-forge compose executive-report"
      );
      expect(result.stderr, args.join(" ")).not.toContain(PACKAGE_ROOT);
    }
  });

  test("rejects an unknown v1 block with exit code 2", async () => {
    const externalCwd = await makeExternalCwd();
    const result = await runCli(externalCwd, [
      "compose",
      "not-shipped",
      "--data",
      "data.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "output.pdf",
      "--receipt",
      "receipt.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Unknown compose block "not-shipped"');
    expect(result.stderr).toContain("Available blocks: executive-report");
    expect(result.stderr).toContain("Usage:");
  });

  test("rejects an unsafe PDF basename before reading data or creating output", async () => {
    const externalCwd = await makeExternalCwd();
    const outputPath = join(externalCwd, "artifacts/quarterly report.pdf");
    const result = await runCli(externalCwd, [
      "compose",
      "executive-report",
      "--data",
      "missing.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/quarterly report.pdf",
      "--receipt",
      "artifacts/receipt.json",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("safe basename");
    expect(await pathExists(outputPath)).toBe(false);
  });

  test("fails malformed static data with exit code 1 and never creates a receipt", async () => {
    const externalCwd = await makeExternalCwd();
    const malformedDataPath = join(externalCwd, "data/malformed.json");
    const receiptPath = join(externalCwd, "artifacts/malformed.receipt.json");
    await mkdir(join(externalCwd, "data"), { recursive: true });
    await writeFile(malformedDataPath, '{"private":"not-logged",', "utf8");

    const result = await runCli(externalCwd, [
      "compose",
      "executive-report",
      "--data",
      "data/malformed.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/malformed.pdf",
      "--receipt",
      "artifacts/malformed.receipt.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("pdf-forge compose failed:");
    expect(result.stderr).toContain("Failed to parse static JSON file");
    expect(result.stderr).not.toContain("not-logged");
    expect(await pathExists(receiptPath)).toBe(false);
  });

  test("fails an unknown theme with exit code 1 and never creates a receipt", async () => {
    const externalCwd = await makeExternalCwd();
    const relativeDataPath = await copyFixtureToExternalCwd(externalCwd);
    const receiptPath = join(externalCwd, "artifacts/unknown-theme.receipt.json");
    const result = await runCli(externalCwd, [
      "compose",
      "executive-report",
      "--data",
      relativeDataPath,
      "--theme",
      "not-shipped",
      "--output",
      "artifacts/unknown-theme.pdf",
      "--receipt",
      "artifacts/unknown-theme.receipt.json",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("pdf-forge compose failed:");
    expect(result.stderr).toContain("not-shipped");
    expect(await pathExists(receiptPath)).toBe(false);
  });
});
