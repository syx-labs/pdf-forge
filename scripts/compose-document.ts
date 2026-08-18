import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { mergePages } from "../src/core/merger";
import { renderPages } from "../src/core/renderer";
import { bindExecutiveReport } from "../src/data/bindings/executive-report";
import { DataProviderRegistry } from "../src/data/provider-registry";
import { StaticJsonProvider } from "../src/data/providers/static-json";
import { redactDataSnapshot } from "../src/data/redact";
import { composeDocumentPageWithMetadata } from "../src/registry/compose";
import { parseDocumentManifest } from "../src/registry/document-manifest";
import { loadRegistry } from "../src/registry/loader";
import {
  buildPdfBuildReceipt,
  isSafePdfOutputPath,
} from "../src/registry/receipt";

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

function comparisonPath(path: string): string {
  return resolve(path).normalize("NFC").toLowerCase();
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

async function canonicalComparisonPath(path: string): Promise<string> {
  let candidate = resolve(path);
  const missingSegments: string[] = [];
  while (true) {
    try {
      return comparisonPath(join(await realpath(candidate), ...missingSegments));
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw error;
      }
      missingSegments.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

type PathIdentity = Readonly<{
  canonicalPath: string;
  device?: number;
  inode?: number;
}>;

async function pathIdentity(path: string): Promise<PathIdentity> {
  const canonicalPath = await canonicalComparisonPath(path);
  try {
    const pathStat = await stat(path);
    return {
      canonicalPath,
      device: pathStat.dev,
      inode: pathStat.ino,
    };
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
    return { canonicalPath };
  }
}

function arePathAliases(left: PathIdentity, right: PathIdentity): boolean {
  return (
    left.canonicalPath === right.canonicalPath ||
    (left.device !== undefined &&
      left.inode !== undefined &&
      left.device === right.device &&
      left.inode === right.inode)
  );
}

async function assertDistinctComposePaths(options: ComposeOptions): Promise<void> {
  const paths = [options.dataPath, options.outputPath, options.receiptPath];
  const identities = await Promise.all(paths.map(pathIdentity));
  for (let leftIndex = 0; leftIndex < identities.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < identities.length;
      rightIndex += 1
    ) {
      const left = identities[leftIndex];
      const right = identities[rightIndex];
      if (left !== undefined && right !== undefined && arePathAliases(left, right)) {
        throw new Error("Data, output PDF, and receipt JSON paths must be distinct.");
      }
    }
  }
}

type PublishedFile = Readonly<{
  finalPath: string;
  backupPath?: string;
}>;

class PublicationRollbackError extends AggregateError {
  constructor(publicationError: unknown, rollbackError: unknown) {
    super(
      [publicationError, rollbackError],
      "Artifact publication failed and rollback could not restore pre-existing files."
    );
  }
}

async function publishStagedFile(
  stagedPath: string,
  finalPath: string,
  stageRoot: string
): Promise<PublishedFile> {
  let backupPath: string | undefined;
  try {
    const destinationStat = await lstat(finalPath);
    if (destinationStat.isDirectory()) {
      throw new Error(
        `Cannot publish "${basename(finalPath)}" because the destination is a directory.`
      );
    }
    backupPath = join(stageRoot, "pre-existing");
    await rename(finalPath, backupPath);
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  try {
    await rename(stagedPath, finalPath);
  } catch (publicationError) {
    if (backupPath !== undefined) {
      try {
        await rename(backupPath, finalPath);
      } catch (rollbackError) {
        throw new PublicationRollbackError(publicationError, rollbackError);
      }
    }
    throw publicationError;
  }
  return { finalPath, backupPath };
}

async function rollbackPublishedFile(published: PublishedFile): Promise<void> {
  await rm(published.finalPath, { force: true });
  if (published.backupPath !== undefined) {
    await rename(published.backupPath, published.finalPath);
  }
}

async function publishStagedPair(
  input: Readonly<{
    stagedOutputPath: string;
    outputPath: string;
    outputStageRoot: string;
    stagedReceiptPath: string;
    receiptPath: string;
    receiptStageRoot: string;
  }>
): Promise<void> {
  let publishedOutput: PublishedFile | undefined;
  try {
    publishedOutput = await publishStagedFile(
      input.stagedOutputPath,
      input.outputPath,
      input.outputStageRoot
    );
    await publishStagedFile(
      input.stagedReceiptPath,
      input.receiptPath,
      input.receiptStageRoot
    );
  } catch (publicationError) {
    if (publishedOutput !== undefined) {
      try {
        await rollbackPublishedFile(publishedOutput);
      } catch (rollbackError) {
        throw new PublicationRollbackError(publicationError, rollbackError);
      }
    }
    throw publicationError;
  }
}

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
  if (!isSafePdfOutputPath(outputPath)) {
    return {
      kind: "error",
      message: "Output PDF must have a safe basename.",
    };
  }
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
  await assertDistinctComposePaths(options);
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
  const composition = await composeDocumentPageWithMetadata(
    manifest,
    page,
    packageRoot
  );

  const temporaryRoot = await mkdtemp(join(tmpdir(), "pdf-forge-compose-"));
  try {
    const pagesDir = join(temporaryRoot, "pages");
    const renderedDir = join(temporaryRoot, "rendered");
    await mkdir(pagesDir, { recursive: true });
    await writeFile(
      join(pagesDir, "01-executive-report.html"),
      composition.html,
      "utf8"
    );
    await renderPages({
      inputDir: pagesDir,
      outputDir: renderedDir,
      format: "docs",
      scale: 1,
      blockNetwork: true,
    });
    const outputParent = dirname(options.outputPath);
    const receiptParent = dirname(options.receiptPath);
    const stageRoots: string[] = [];
    let retainStaging = false;
    try {
      await mkdir(outputParent, { recursive: true });
      await mkdir(receiptParent, { recursive: true });
      const outputStageRoot = await mkdtemp(
        join(outputParent, ".pdf-forge-compose-output-")
      );
      stageRoots.push(outputStageRoot);
      const receiptStageRoot = await mkdtemp(
        join(receiptParent, ".pdf-forge-compose-receipt-")
      );
      stageRoots.push(receiptStageRoot);
      const stagedOutputPath = join(
        outputStageRoot,
        basename(options.outputPath)
      );
      const stagedReceiptPath = join(receiptStageRoot, "receipt.json");
      const mergeResult = await mergePages({
        inputDir: renderedDir,
        outputPath: stagedOutputPath,
      });
      const registry = await loadRegistry(packageRoot);
      const receipt = await buildPdfBuildReceipt({
        manifest,
        registry,
        componentIds: composition.componentIds,
        snapshot: redacted,
        mergeResult,
        warnings: [],
        createdAt: new Date().toISOString(),
      });
      await writeFile(
        stagedReceiptPath,
        `${JSON.stringify(receipt, null, 2)}\n`,
        "utf8"
      );
      await publishStagedPair({
        stagedOutputPath,
        outputPath: options.outputPath,
        outputStageRoot,
        stagedReceiptPath,
        receiptPath: options.receiptPath,
        receiptStageRoot,
      });

      console.log(`Created executive-report PDF: ${basename(options.outputPath)}`);
      console.log(`Receipt: ${basename(options.receiptPath)}`);
      console.log(`Pages: ${receipt.output.pageCount}`);
    } catch (error) {
      retainStaging = error instanceof PublicationRollbackError;
      throw error;
    } finally {
      if (!retainStaging) {
        await Promise.all(
          stageRoots.map((stageRoot) =>
            rm(stageRoot, { recursive: true, force: true })
          )
        );
      }
    }
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
