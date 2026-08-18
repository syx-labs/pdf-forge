import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { discoverPackageRoot } from "../core/package-root.js";
import { RegistrySchema } from "./schemas.js";
import type { Registry, RegistryEntry } from "./types.js";

type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object
    ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
    : Value;

export type LoadedRegistryEntry = DeepReadonly<RegistryEntry>;

export type LoadedRegistry = Readonly<{
  version: Registry["version"];
  entries: readonly LoadedRegistryEntry[];
}>;

function parseRegistryYaml(raw: string, registryPath: string): unknown {
  try {
    return load(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse registry YAML at "${registryPath}": ${detail}`,
      { cause: error }
    );
  }
}

function assertUniqueEntryIds(
  entries: readonly RegistryEntry[],
  registryPath: string
): void {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(
        `Duplicate registry entry id "${entry.id}" in "${registryPath}".`
      );
    }
    ids.add(entry.id);
  }
}

async function assertTemplateFiles(
  entries: readonly RegistryEntry[],
  registryRoot: string
): Promise<void> {
  for (const entry of entries) {
    const templatePath = join(registryRoot, entry.template);
    try {
      const templateStat = await stat(templatePath);
      if (!templateStat.isFile()) {
        throw new Error("Referenced path is not a file.");
      }
    } catch (error) {
      throw new Error(
        `Missing template file for registry entry "${entry.id}": "${templatePath}".`,
        { cause: error }
      );
    }
  }
}

async function assertSchemaFiles(
  entries: readonly RegistryEntry[],
  registryRoot: string
): Promise<void> {
  for (const entry of entries) {
    const schemaPath = join(registryRoot, entry.schema);
    try {
      const schemaStat = await stat(schemaPath);
      if (!schemaStat.isFile()) {
        throw new Error("Referenced path is not a file.");
      }
    } catch (error) {
      throw new Error(
        `Missing schema file for registry entry "${entry.id}": "${schemaPath}".`,
        { cause: error }
      );
    }
  }
}

function freezeEntry(entry: RegistryEntry): LoadedRegistryEntry {
  const formats = Object.freeze([...entry.formats]);
  const themes = Object.freeze([...entry.themes]);
  return Object.freeze({ ...entry, formats, themes });
}

async function resolvePackageRoot(injectedRoot?: string): Promise<string> {
  if (injectedRoot !== undefined) {
    return injectedRoot;
  }

  const modulePath = fileURLToPath(import.meta.url);
  const discoveryEntry =
    extname(modulePath) === ".ts"
      ? new URL("../../bin/pdf-forge.ts", import.meta.url)
      : import.meta.url;
  return discoverPackageRoot(discoveryEntry);
}

export async function loadRegistry(
  packageRoot?: string
): Promise<LoadedRegistry> {
  const resolvedRoot = await resolvePackageRoot(packageRoot);
  const registryRoot = join(resolvedRoot, "assets/registry");
  const registryPath = join(registryRoot, "registry.yaml");
  const raw = await readFile(registryPath, "utf-8");
  const registry = RegistrySchema.parse(parseRegistryYaml(raw, registryPath));
  assertUniqueEntryIds(registry.entries, registryPath);
  await assertTemplateFiles(registry.entries, registryRoot);
  await assertSchemaFiles(registry.entries, registryRoot);
  const entries = Object.freeze(
    registry.entries
      .map(freezeEntry)
      .sort((left, right) => left.id.localeCompare(right.id))
  );

  return Object.freeze({ version: registry.version, entries });
}
