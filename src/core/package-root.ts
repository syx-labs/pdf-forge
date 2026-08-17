import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "pdf-forge-mcp";
const PACKAGE_SENTINELS = [
  "bin/pdf-forge.ts",
  "scripts/render-pdf.ts",
  "skills/pdf-forge/SKILL.md",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function entryPath(entry: string | URL): string {
  if (entry instanceof URL || entry.startsWith("file:")) {
    return fileURLToPath(entry);
  }
  return entry;
}

function hasExpectedEntryLayout(packageRoot: string, entryReal: string): boolean {
  const entryRelative = relative(packageRoot, entryReal);
  if (
    entryRelative === "" ||
    entryRelative === ".." ||
    entryRelative.startsWith(`..${sep}`) ||
    isAbsolute(entryRelative)
  ) {
    return false;
  }

  const parts = entryRelative.split(sep);
  return (
    entryRelative === ["bin", "pdf-forge.ts"].join(sep) ||
    entryRelative === ["src", "mcp", "server.ts"].join(sep) ||
    (parts[0] === "dist" && entryRelative.endsWith(".js"))
  );
}

async function packageJsonOrNull(
  candidate: string
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(join(candidate, "package.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return null;
    }
    throw error;
  }
}

export async function discoverPackageRoot(entry: string | URL): Promise<string> {
  const entryReal = await realpath(entryPath(entry));
  let candidate = dirname(entryReal);

  while (true) {
    const packageJson = await packageJsonOrNull(candidate);
    if (packageJson?.name === PACKAGE_NAME) {
      if (!hasExpectedEntryLayout(candidate, entryReal)) {
        throw new Error(
          `Entry "${entryReal}" is outside the expected ${PACKAGE_NAME} source/build layouts.`
        );
      }

      const missingSentinels: string[] = [];
      for (const sentinel of PACKAGE_SENTINELS) {
        try {
          await readFile(join(candidate, sentinel), "utf-8");
        } catch (error) {
          missingSentinels.push(
            `${sentinel} (${error instanceof Error ? error.message : String(error)})`
          );
        }
      }
      if (missingSentinels.length > 0) {
        throw new Error(
          `Invalid ${PACKAGE_NAME} root "${candidate}"; missing: ${missingSentinels.join(", ")}.`
        );
      }

      return candidate;
    }

    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }

  throw new Error(
    `Could not find a verified ${PACKAGE_NAME} root for entry "${entryReal}".`
  );
}
