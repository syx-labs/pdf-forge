import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
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

  test("rejects case-insensitive aliases among data, output, and receipt before mutation", async () => {
    const dataOutputCwd = await makeExternalCwd();
    const dataOutputPath = join(dataOutputCwd, "Case/Data.PDF");
    const dataOutputReceipt = join(dataOutputCwd, "artifacts/data-output.json");
    await mkdir(join(dataOutputCwd, "Case"), { recursive: true });
    await copyFile(SOURCE_FIXTURE, dataOutputPath);
    const dataOutputBefore = await readFile(dataOutputPath);

    const dataOutput = await runCli(dataOutputCwd, [
      "compose",
      "executive-report",
      "--data",
      "Case/Data.PDF",
      "--theme",
      "ivory-editorial",
      "--output",
      "case/data.pdf",
      "--receipt",
      "artifacts/data-output.json",
    ]);

    expect(dataOutput.exitCode).toBe(1);
    expect(dataOutput.stdout).toBe("");
    expect(dataOutput.stderr).toContain("must be distinct");
    expect(await readFile(dataOutputPath)).toEqual(dataOutputBefore);
    expect(await pathExists(dataOutputReceipt)).toBe(false);

    const outputReceiptCwd = await makeExternalCwd();
    const relativeDataPath = await copyFixtureToExternalCwd(outputReceiptCwd);
    const outputPath = join(outputReceiptCwd, "Artifacts/Report.PDF");
    await mkdir(join(outputReceiptCwd, "Artifacts"), { recursive: true });
    await writeFile(outputPath, "pre-existing output\n", "utf8");
    const outputBefore = await readFile(outputPath);

    const outputReceipt = await runCli(outputReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      relativeDataPath,
      "--theme",
      "ivory-editorial",
      "--output",
      "Artifacts/Report.PDF",
      "--receipt",
      "artifacts/report.pdf",
    ]);

    expect(outputReceipt.exitCode).toBe(1);
    expect(outputReceipt.stdout).toBe("");
    expect(outputReceipt.stderr).toContain("must be distinct");
    expect(await readFile(outputPath)).toEqual(outputBefore);

    const dataReceiptCwd = await makeExternalCwd();
    const dataReceiptPath = join(dataReceiptCwd, "Data/Receipt.JSON");
    const dataReceiptOutput = join(dataReceiptCwd, "artifacts/data-receipt.pdf");
    await mkdir(join(dataReceiptCwd, "Data"), { recursive: true });
    await copyFile(SOURCE_FIXTURE, dataReceiptPath);
    const dataReceiptBefore = await readFile(dataReceiptPath);

    const dataReceipt = await runCli(dataReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      "Data/Receipt.JSON",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/data-receipt.pdf",
      "--receipt",
      "data/receipt.json",
    ]);

    expect(dataReceipt.exitCode).toBe(1);
    expect(dataReceipt.stdout).toBe("");
    expect(dataReceipt.stderr).toContain("must be distinct");
    expect(await readFile(dataReceiptPath)).toEqual(dataReceiptBefore);
    expect(await pathExists(dataReceiptOutput)).toBe(false);
  }, 60_000);

  test("rejects symlink aliases among data, output, and receipt before mutation", async () => {
    const dataOutputCwd = await makeExternalCwd();
    const dataOutputPath = join(dataOutputCwd, "inputs/source.pdf");
    const linkedOutputPath = join(dataOutputCwd, "artifacts/output.pdf");
    const dataOutputReceipt = join(dataOutputCwd, "artifacts/receipt.json");
    await Promise.all([
      mkdir(join(dataOutputCwd, "inputs"), { recursive: true }),
      mkdir(join(dataOutputCwd, "artifacts"), { recursive: true }),
    ]);
    await copyFile(SOURCE_FIXTURE, dataOutputPath);
    await symlink(dataOutputPath, linkedOutputPath);
    const dataOutputBefore = await readFile(dataOutputPath);

    const dataOutput = await runCli(dataOutputCwd, [
      "compose",
      "executive-report",
      "--data",
      "inputs/source.pdf",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/output.pdf",
      "--receipt",
      "artifacts/receipt.json",
    ]);

    expect(dataOutput.exitCode).toBe(1);
    expect(dataOutput.stdout).toBe("");
    expect(dataOutput.stderr).toContain("must be distinct");
    expect(await readFile(dataOutputPath)).toEqual(dataOutputBefore);
    expect(await pathExists(dataOutputReceipt)).toBe(false);

    const dataReceiptCwd = await makeExternalCwd();
    const dataReceiptPath = join(dataReceiptCwd, "inputs/source.json");
    const linkedReceiptPath = join(dataReceiptCwd, "artifacts/receipt.json");
    const dataReceiptOutput = join(dataReceiptCwd, "artifacts/output.pdf");
    await Promise.all([
      mkdir(join(dataReceiptCwd, "inputs"), { recursive: true }),
      mkdir(join(dataReceiptCwd, "artifacts"), { recursive: true }),
    ]);
    await copyFile(SOURCE_FIXTURE, dataReceiptPath);
    await symlink(dataReceiptPath, linkedReceiptPath);
    const dataReceiptBefore = await readFile(dataReceiptPath);

    const dataReceipt = await runCli(dataReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      "inputs/source.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/output.pdf",
      "--receipt",
      "artifacts/receipt.json",
    ]);

    expect(dataReceipt.exitCode).toBe(1);
    expect(dataReceipt.stdout).toBe("");
    expect(dataReceipt.stderr).toContain("must be distinct");
    expect(await readFile(dataReceiptPath)).toEqual(dataReceiptBefore);
    expect(await pathExists(dataReceiptOutput)).toBe(false);

    const outputReceiptCwd = await makeExternalCwd();
    const relativeDataPath = await copyFixtureToExternalCwd(outputReceiptCwd);
    const artifactsDir = join(outputReceiptCwd, "artifacts");
    const linkedArtifactsDir = join(outputReceiptCwd, "linked-artifacts");
    const outputPath = join(artifactsDir, "report.pdf");
    const receiptPath = join(linkedArtifactsDir, "report.pdf");
    await mkdir(artifactsDir);
    await symlink(artifactsDir, linkedArtifactsDir, "dir");

    const outputReceipt = await runCli(outputReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      relativeDataPath,
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/report.pdf",
      "--receipt",
      "linked-artifacts/report.pdf",
    ]);

    expect(outputReceipt.exitCode).toBe(1);
    expect(outputReceipt.stdout).toBe("");
    expect(outputReceipt.stderr).toContain("must be distinct");
    expect(await pathExists(outputPath)).toBe(false);
    expect(await pathExists(receiptPath)).toBe(false);
  }, 60_000);

  test("rejects hardlink aliases among data, output, and receipt before mutation", async () => {
    const dataOutputCwd = await makeExternalCwd();
    const dataOutputPath = join(dataOutputCwd, "inputs/source.json");
    const linkedOutputPath = join(dataOutputCwd, "artifacts/output.pdf");
    const dataOutputReceipt = join(dataOutputCwd, "artifacts/receipt.json");
    await Promise.all([
      mkdir(join(dataOutputCwd, "inputs"), { recursive: true }),
      mkdir(join(dataOutputCwd, "artifacts"), { recursive: true }),
    ]);
    await copyFile(SOURCE_FIXTURE, dataOutputPath);
    await link(dataOutputPath, linkedOutputPath);
    const dataOutputBefore = await readFile(dataOutputPath);

    const dataOutput = await runCli(dataOutputCwd, [
      "compose",
      "executive-report",
      "--data",
      "inputs/source.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/output.pdf",
      "--receipt",
      "artifacts/receipt.json",
    ]);

    expect(dataOutput.exitCode).toBe(1);
    expect(dataOutput.stdout).toBe("");
    expect(dataOutput.stderr).toContain("must be distinct");
    expect(await readFile(dataOutputPath)).toEqual(dataOutputBefore);
    expect(await pathExists(dataOutputReceipt)).toBe(false);

    const dataReceiptCwd = await makeExternalCwd();
    const dataReceiptPath = join(dataReceiptCwd, "inputs/source.json");
    const linkedReceiptPath = join(dataReceiptCwd, "artifacts/receipt.json");
    const dataReceiptOutput = join(dataReceiptCwd, "artifacts/output.pdf");
    await Promise.all([
      mkdir(join(dataReceiptCwd, "inputs"), { recursive: true }),
      mkdir(join(dataReceiptCwd, "artifacts"), { recursive: true }),
    ]);
    await copyFile(SOURCE_FIXTURE, dataReceiptPath);
    await link(dataReceiptPath, linkedReceiptPath);
    const dataReceiptBefore = await readFile(dataReceiptPath);

    const dataReceipt = await runCli(dataReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      "inputs/source.json",
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/output.pdf",
      "--receipt",
      "artifacts/receipt.json",
    ]);

    expect(dataReceipt.exitCode).toBe(1);
    expect(dataReceipt.stdout).toBe("");
    expect(dataReceipt.stderr).toContain("must be distinct");
    expect(await readFile(dataReceiptPath)).toEqual(dataReceiptBefore);
    expect(await pathExists(dataReceiptOutput)).toBe(false);

    const outputReceiptCwd = await makeExternalCwd();
    const relativeDataPath = await copyFixtureToExternalCwd(outputReceiptCwd);
    const outputPath = join(outputReceiptCwd, "artifacts/output.pdf");
    const linkedReceiptPathForOutput = join(
      outputReceiptCwd,
      "receipts/output.json"
    );
    await Promise.all([
      mkdir(join(outputReceiptCwd, "artifacts"), { recursive: true }),
      mkdir(join(outputReceiptCwd, "receipts"), { recursive: true }),
    ]);
    await writeFile(outputPath, "pre-existing output\n", "utf8");
    await link(outputPath, linkedReceiptPathForOutput);
    const outputBefore = await readFile(outputPath);

    const outputReceipt = await runCli(outputReceiptCwd, [
      "compose",
      "executive-report",
      "--data",
      relativeDataPath,
      "--theme",
      "ivory-editorial",
      "--output",
      "artifacts/output.pdf",
      "--receipt",
      "receipts/output.json",
    ]);

    expect(outputReceipt.exitCode).toBe(1);
    expect(outputReceipt.stdout).toBe("");
    expect(outputReceipt.stderr).toContain("must be distinct");
    expect(await readFile(outputPath)).toEqual(outputBefore);
    expect(await readFile(linkedReceiptPathForOutput)).toEqual(outputBefore);
  }, 60_000);

  test("rolls back the staged PDF when receipt publication fails and preserves pre-existing paths", async () => {
    for (const withPreExistingOutput of [false, true]) {
      const externalCwd = await makeExternalCwd();
      const relativeDataPath = await copyFixtureToExternalCwd(externalCwd);
      const dataPath = join(externalCwd, relativeDataPath);
      const artifactsDir = join(externalCwd, "artifacts");
      const outputPath = join(artifactsDir, "report.pdf");
      const receiptPath = join(artifactsDir, "report.receipt.json");
      const receiptSentinelPath = join(receiptPath, "sentinel.txt");
      await mkdir(receiptPath, { recursive: true });
      await writeFile(receiptSentinelPath, "pre-existing receipt directory\n", "utf8");
      if (withPreExistingOutput) {
        await writeFile(outputPath, "pre-existing output\n", "utf8");
      }
      const dataBefore = await readFile(dataPath);
      const receiptSentinelBefore = await readFile(receiptSentinelPath);
      const outputBefore = withPreExistingOutput
        ? await readFile(outputPath)
        : undefined;

      const result = await runCli(externalCwd, [
        "compose",
        "executive-report",
        "--data",
        relativeDataPath,
        "--theme",
        "ivory-editorial",
        "--output",
        "artifacts/report.pdf",
        "--receipt",
        "artifacts/report.receipt.json",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("pdf-forge compose failed:");
      expect(await readFile(dataPath)).toEqual(dataBefore);
      expect((await stat(receiptPath)).isDirectory()).toBe(true);
      expect(await readFile(receiptSentinelPath)).toEqual(receiptSentinelBefore);
      if (outputBefore === undefined) {
        expect(await pathExists(outputPath)).toBe(false);
      } else {
        expect(await readFile(outputPath)).toEqual(outputBefore);
      }
      expect((await readdir(artifactsDir)).sort()).toEqual(
        withPreExistingOutput
          ? ["report.pdf", "report.receipt.json"]
          : ["report.receipt.json"]
      );
    }
  }, 60_000);

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
