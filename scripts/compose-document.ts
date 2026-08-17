import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { mergePages } from "../src/core/merger";
import { renderPages } from "../src/core/renderer";
import { bindExecutiveReport } from "../src/data/bindings/executive-report";
import { DataProviderRegistry } from "../src/data/provider-registry";
import { StaticJsonProvider } from "../src/data/providers/static-json";
import { redactDataSnapshot } from "../src/data/redact";
import { composeDocumentPage } from "../src/registry/compose";
import { parseDocumentManifest } from "../src/registry/document-manifest";
import { loadRegistry } from "../src/registry/loader";
import { buildPdfBuildReceipt } from "../src/registry/receipt";

const COMPOSE_USAGE = [
  "pdf-forge compose - Compose a data-backed document",
  "",
  "Usage:",
  "  pdf-forge compose executive-report --data <path> --theme <id> --output <pdf> --receipt <json>",
].join("\n");
const REQUIRED_OPTIONS = ["--data", "--theme", "--output", "--receipt"] as const;
const EXECUTIVE_REPORT_COLUMNS = [
  "region",
  "revenue",
  "target",
  "recommendation",
] as const;

type RequiredOption = (typeof REQUIRED_OPTIONS)[number];
type ComposeOptions = Readonly<{
  block: "executive-report";
  dataPath: string;
  theme: string;
  outputPath: string;
  receiptPath: string;
}>;
type ParseResult =
  | Readonly<{ kind: "options"; options: ComposeOptions }>
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "error"; message: string }>;

function isRequiredOption(argument: string): argument is RequiredOption {
  return (
    argument === "--data" ||
    argument === "--theme" ||
    argument === "--output" ||
    argument === "--receipt"
  );
}

function parseArguments(args: readonly string[], callerCwd: string): ParseResult {
  if (
    args.length === 1 &&
    (args[0] === "help" || args[0] === "--help" || args[0] === "-h")
  ) {
    return { kind: "help" };
  }

  const block = args[0];
  if (block === undefined) {
    return { kind: "error", message: "Missing compose block ID." };
  }
  if (block.startsWith("-")) {
    return { kind: "error", message: `Unknown option "${block}".` };
  }
  if (block !== "executive-report") {
    return {
      kind: "error",
      message: `Unknown compose block "${block}". Available blocks: executive-report.`,
    };
  }
  if (
    args.length === 2 &&
    (args[1] === "help" || args[1] === "--help" || args[1] === "-h")
  ) {
    return { kind: "help" };
  }

  const values = new Map<RequiredOption, string>();
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      break;
    }
    if (!argument.startsWith("-")) {
      return {
        kind: "error",
        message: `Unexpected argument "${argument}".`,
      };
    }
    if (!isRequiredOption(argument)) {
      return { kind: "error", message: `Unknown option "${argument}".` };
    }
    const option = argument;
    if (values.has(option)) {
      return { kind: "error", message: `Duplicate option "${option}".` };
    }
    const value = args[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("-")) {
      return {
        kind: "error",
        message: `Option "${option}" requires a value.`,
      };
    }
    values.set(option, value);
    index += 1;
  }

  const missing = REQUIRED_OPTIONS.filter((option) => !values.has(option));
  if (missing.length > 0) {
    return {
      kind: "error",
      message: `Missing required options: ${missing.join(", ")}.`,
    };
  }

  const dataPath = values.get("--data");
  const theme = values.get("--theme");
  const outputValue = values.get("--output");
  const receiptValue = values.get("--receipt");
  if (
    dataPath === undefined ||
    theme === undefined ||
    outputValue === undefined ||
    receiptValue === undefined
  ) {
    return {
      kind: "error",
      message: "Required compose options were not resolved.",
    };
  }

  const outputPath = resolve(callerCwd, outputValue);
  const receiptPath = resolve(callerCwd, receiptValue);
  if (outputPath === receiptPath) {
    return {
      kind: "error",
      message: "Output PDF and receipt JSON paths must be distinct.",
    };
  }

  return {
    kind: "options",
    options: {
      block,
      dataPath: resolve(callerCwd, dataPath),
      theme,
      outputPath,
      receiptPath,
    },
  };
}

async function compose(options: ComposeOptions, packageRoot: string): Promise<void> {
  const providers = new DataProviderRegistry();
  providers.register(new StaticJsonProvider());
  const abortController = new AbortController();
  const snapshot = await providers.load(
    "static-json",
    { filePath: options.dataPath },
    { signal: abortController.signal }
  );
  const redacted = redactDataSnapshot(snapshot, {
    mode: "allow",
    columns: [...EXECUTIVE_REPORT_COLUMNS],
  });
  const props = bindExecutiveReport(redacted);
  const manifest = parseDocumentManifest({
    schemaVersion: "1",
    documentId: options.block,
    format: "docs",
    theme: options.theme,
    pages: [
      {
        id: options.block,
        selection: { kind: "block", id: options.block },
        props,
      },
    ],
    snapshotRef: redacted.snapshotId,
  });
  const page = manifest.pages[0];
  if (page === undefined) {
    throw new Error("Composed document manifest has no page.");
  }
  const html = await composeDocumentPage(manifest, page, packageRoot);

  const temporaryRoot = await mkdtemp(join(tmpdir(), "pdf-forge-compose-"));
  try {
    const pagesDir = join(temporaryRoot, "pages");
    const renderedDir = join(temporaryRoot, "rendered");
    await mkdir(pagesDir, { recursive: true });
    await writeFile(join(pagesDir, "01-executive-report.html"), html, "utf8");
    await renderPages({
      inputDir: pagesDir,
      outputDir: renderedDir,
      format: "docs",
      scale: 1,
    });
    await mkdir(dirname(options.outputPath), { recursive: true });
    const mergeResult = await mergePages({
      inputDir: renderedDir,
      outputPath: options.outputPath,
    });
    const registry = await loadRegistry(packageRoot);
    const receipt = await buildPdfBuildReceipt({
      manifest,
      registry,
      componentIds: ["executive-report", "metric-card", "data-table"],
      snapshot: redacted,
      mergeResult,
      warnings: [],
      createdAt: new Date().toISOString(),
    });
    await mkdir(dirname(options.receiptPath), { recursive: true });
    await writeFile(
      options.receiptPath,
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8"
    );

    console.log(`Created executive-report PDF: ${basename(options.outputPath)}`);
    console.log(`Receipt: ${basename(options.receiptPath)}`);
    console.log(`Pages: ${receipt.output.pageCount}`);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2), process.cwd());
  if (parsed.kind === "help") {
    console.log(COMPOSE_USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error("");
    console.error(COMPOSE_USAGE);
    return 2;
  }

  const packageRoot = process.env.PDF_FORGE_HOME;
  if (packageRoot === undefined || packageRoot.length === 0) {
    console.error("pdf-forge compose failed: package root was not provided by the CLI.");
    return 1;
  }

  try {
    await compose(parsed.options, packageRoot);
    return 0;
  } catch (error) {
    console.error(
      "pdf-forge compose failed:",
      error instanceof Error ? error.message : String(error)
    );
    return 1;
  }
}

process.exitCode = await main();
