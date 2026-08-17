import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPackageRoot } from "../core/package-root.js";
import { loadRegistry } from "./loader.js";
import type { LoadedRegistryEntry } from "./loader.js";
import { ThemeSchema, themeToCssVariables } from "./theme.js";
import type { RegistryEntry, RegistryFormat } from "./types.js";

export type ResolveRegistryEntryOptions = Readonly<{
  id: string;
  kind: RegistryEntry["kind"];
  format: RegistryFormat;
  theme: string;
  packageRoot?: string;
}>;

export type ResolvedRegistryEntry = Readonly<{
  entry: LoadedRegistryEntry;
  templatePath: string;
  schemaPath: string;
  themePath: string;
  cssVariables: string;
}>;

async function resolvePackageRoot(packageRoot?: string): Promise<string> {
  if (packageRoot !== undefined) {
    return packageRoot;
  }

  const modulePath = fileURLToPath(import.meta.url);
  const discoveryEntry =
    extname(modulePath) === ".ts"
      ? new URL("../../bin/pdf-forge.ts", import.meta.url)
      : import.meta.url;
  return discoverPackageRoot(discoveryEntry);
}

function assertContainedPath(
  registryRoot: string,
  assetPath: string,
  assetKind: "template" | "schema" | "theme",
  entryId: string
): void {
  const relativePath = relative(registryRoot, assetPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Registry ${assetKind} for entry "${entryId}" escapes registry root "${registryRoot}": "${assetPath}".`
    );
  }
}

export async function resolveRegistryEntry(
  options: ResolveRegistryEntryOptions
): Promise<ResolvedRegistryEntry> {
  const packageRoot = await resolvePackageRoot(options.packageRoot);
  const registry = await loadRegistry(packageRoot);
  const entry = registry.entries.find((candidate) => candidate.id === options.id);
  if (entry === undefined) {
    const availableIds = registry.entries.map((candidate) => candidate.id).join(", ");
    throw new Error(
      `Unknown registry entry id "${options.id}". Available ids: ${availableIds || "none"}.`
    );
  }
  if (entry.kind !== options.kind) {
    throw new Error(
      `Registry entry "${entry.id}" has kind "${entry.kind}", not requested kind "${options.kind}".`
    );
  }
  if (!entry.formats.includes(options.format)) {
    throw new Error(
      `Registry entry "${entry.id}" does not support format "${options.format}". Supported formats: ${entry.formats.join(", ")}.`
    );
  }
  if (!entry.themes.includes(options.theme)) {
    throw new Error(
      `Registry entry "${entry.id}" does not support theme "${options.theme}". Supported themes: ${entry.themes.join(", ")}.`
    );
  }

  const registryRoot = await realpath(join(packageRoot, "assets/registry"));
  const templatePath = await realpath(join(registryRoot, entry.template));
  assertContainedPath(registryRoot, templatePath, "template", entry.id);
  const schemaPath = await realpath(join(registryRoot, entry.schema));
  assertContainedPath(registryRoot, schemaPath, "schema", entry.id);
  const themePath = await realpath(
    join(registryRoot, "themes", `${options.theme}.json`)
  );
  assertContainedPath(registryRoot, themePath, "theme", entry.id);
  const rawTheme = await readFile(themePath, "utf-8");
  const theme = ThemeSchema.parse(JSON.parse(rawTheme));

  return Object.freeze({
    entry,
    templatePath,
    schemaPath,
    themePath,
    cssVariables: themeToCssVariables(theme),
  });
}
