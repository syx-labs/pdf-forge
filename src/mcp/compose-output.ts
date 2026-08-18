import {
  lstat,
  link,
  mkdir,
  mkdtemp,
  realpath,
  rm,
} from "node:fs/promises";
import {
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
  win32,
} from "node:path";

const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;

export class ComposeOutputPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeOutputPathError";
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function assertContained(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new ComposeOutputPathError(
      "Output PDF path escapes the configured compose root."
    );
  }
}

function outputSegments(outputPath: string): readonly string[] {
  return outputPath.split("/");
}

export function isSafeComposeOutputPath(outputPath: string): boolean {
  if (
    outputPath.length === 0 ||
    outputPath.includes("\\") ||
    isAbsolute(outputPath) ||
    posix.isAbsolute(outputPath) ||
    win32.isAbsolute(outputPath)
  ) {
    return false;
  }

  const segments = outputSegments(outputPath);
  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        segment !== "." &&
        segment !== ".." &&
        SAFE_PATH_SEGMENT_PATTERN.test(segment)
    )
  );
}

async function assertSecureExistingPath(
  root: string,
  candidate: string,
  expectedKind: "directory" | "file"
): Promise<boolean> {
  let pathStat;
  try {
    pathStat = await lstat(candidate);
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }
    throw error;
  }

  if (pathStat.isSymbolicLink()) {
    throw new ComposeOutputPathError(
      "Output PDF path must not contain symbolic links."
    );
  }
  if (
    (expectedKind === "directory" && !pathStat.isDirectory()) ||
    (expectedKind === "file" && !pathStat.isFile())
  ) {
    throw new ComposeOutputPathError(
      `Output PDF ${expectedKind} path has an invalid filesystem type.`
    );
  }

  const canonical = await realpath(candidate);
  assertContained(root, canonical);
  return true;
}

export async function resolveComposeOutputRoot(
  configuredRoot: string
): Promise<string> {
  const absoluteRoot = resolve(configuredRoot);
  await mkdir(absoluteRoot, { recursive: true });
  const rootStat = await lstat(absoluteRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new ComposeOutputPathError(
      "Configured compose output root must be a real directory."
    );
  }
  return realpath(absoluteRoot);
}

export async function validateComposeOutputTarget(
  root: string,
  outputPath: string
): Promise<string> {
  if (!isSafeComposeOutputPath(outputPath)) {
    throw new ComposeOutputPathError(
      "Output PDF must use a safe relative path beneath the configured compose root."
    );
  }

  const segments = outputSegments(outputPath);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (!(await assertSecureExistingPath(root, current, "directory"))) {
      break;
    }
  }

  const finalPath = join(root, ...segments);
  if (await assertSecureExistingPath(root, finalPath, "file")) {
    throw new ComposeOutputPathError(
      "Output PDF target already exists; compose_pdf does not overwrite files."
    );
  }
  return finalPath;
}

async function ensureSecureParentDirectories(
  root: string,
  outputPath: string
): Promise<void> {
  const segments = outputSegments(outputPath);
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    await mkdir(current).catch((error: unknown) => {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "EEXIST"
      ) {
        throw error;
      }
    });
    await assertSecureExistingPath(root, current, "directory");
  }
}

export async function createComposeStagingDirectory(
  root: string,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted();
  const stagingDirectory = await mkdtemp(join(root, ".pdf-forge-stage-"));
  try {
    signal.throwIfAborted();
    return stagingDirectory;
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function publishStagedPdf(
  root: string,
  outputPath: string,
  stagedPdfPath: string,
  signal: AbortSignal
): Promise<string> {
  signal.throwIfAborted();
  await ensureSecureParentDirectories(root, outputPath);
  signal.throwIfAborted();
  const finalPath = await validateComposeOutputTarget(root, outputPath);
  signal.throwIfAborted();
  await link(stagedPdfPath, finalPath);
  try {
    signal.throwIfAborted();
    await rm(stagedPdfPath, { force: true });
    return finalPath;
  } catch (error) {
    await rm(finalPath, { force: true });
    throw error;
  }
}
