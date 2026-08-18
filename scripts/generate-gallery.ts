import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { discoverPackageRoot } from "../src/core/package-root";
import { mergePages } from "../src/core/merger";
import { renderPages } from "../src/core/renderer";
import { composeDocumentPage } from "../src/registry/compose";
import { parseDocumentManifest } from "../src/registry/document-manifest";
import { loadRegistry } from "../src/registry/loader";
import type { LoadedRegistryEntry } from "../src/registry/loader";

const USAGE =
  "Usage: bun run scripts/generate-gallery.ts --output <dir>";

export type GenerateGalleryOptions = Readonly<{
  outputDir: string;
  packageRoot?: string;
}>;

export type GenerateGalleryResult = Readonly<{
  outputDir: string;
  count: number;
}>;

type ParsedArguments =
  | Readonly<{ kind: "options"; outputDir: string }>
  | Readonly<{ kind: "error"; message: string }>;

type GalleryEntry = Readonly<{
  registryEntry: LoadedRegistryEntry;
  schemaName: string;
  previewName: string;
}>;

function debug(message: string): void {
  if (process.env.PDF_FORGE_GALLERY_DEBUG === "1") {
    console.error(`gallery: ${message}`);
  }
}

function galleryFormat(entry: LoadedRegistryEntry): "docs" | "slides" {
  if (entry.formats.includes("docs")) {
    return "docs";
  }
  if (entry.formats.includes("slides")) {
    return "slides";
  }
  throw new Error(
    `Registry entry "${entry.id}" has no gallery-compatible docs or slides format.`
  );
}

function parseArguments(
  arguments_: readonly string[],
  callerCwd: string
): ParsedArguments {
  let output: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output") {
      if (output !== undefined) {
        return { kind: "error", message: 'Duplicate option "--output".' };
      }
      const value = arguments_[index + 1];
      if (
        value === undefined ||
        value.trim().length === 0 ||
        value.startsWith("-")
      ) {
        return {
          kind: "error",
          message: 'Option "--output" requires a nonempty directory.',
        };
      }
      output = value;
      index += 1;
      continue;
    }
    if (argument?.startsWith("-")) {
      return { kind: "error", message: `Unknown option "${argument}".` };
    }
    return {
      kind: "error",
      message: `Unexpected argument "${argument ?? ""}".`,
    };
  }

  if (output === undefined) {
    return { kind: "error", message: 'Missing required option "--output".' };
  }

  return { kind: "options", outputDir: resolve(callerCwd, output) };
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function assertOutputDoesNotExist(outputDir: string): Promise<void> {
  try {
    await lstat(outputDir);
  } catch (error) {
    if (isMissingPathError(error)) {
      return;
    }
    throw error;
  }
  throw new Error(`Output directory already exists: "${outputDir}".`);
}

function assertContainedPath(
  registryRoot: string,
  assetPath: string,
  label: string,
  entryId: string
): void {
  const relativePath = relative(registryRoot, assetPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `Canonical ${label} for registry entry "${entryId}" escapes the registry root.`
    );
  }
}

async function readCanonicalExample(
  registryRoot: string,
  entry: LoadedRegistryEntry
): Promise<unknown> {
  const templateDirectory = dirname(entry.template);
  const schemaDirectory = dirname(entry.schema);
  if (templateDirectory !== schemaDirectory) {
    throw new Error(
      `Registry entry "${entry.id}" must keep its template, schema, and example together.`
    );
  }

  const requestedPath = join(registryRoot, templateDirectory, "example.json");
  let examplePath: string;
  try {
    examplePath = await realpath(requestedPath);
  } catch (error) {
    throw new Error(
      `Missing canonical example.json for registry entry "${entry.id}".`,
      { cause: error }
    );
  }
  assertContainedPath(registryRoot, examplePath, "example", entry.id);

  const raw = await readFile(examplePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Malformed canonical example.json for registry entry "${entry.id}".`,
      { cause: error }
    );
  }
}

function escapeHtml(value: string): string {
  let escaped = "";
  for (const character of value) {
    switch (character) {
      case "&":
        escaped += "&amp;";
        break;
      case "<":
        escaped += "&lt;";
        break;
      case ">":
        escaped += "&gt;";
        break;
      case '"':
        escaped += "&quot;";
        break;
      case "'":
        escaped += "&#39;";
        break;
      default:
        escaped += character;
    }
  }
  return escaped;
}

function galleryIndex(
  registryVersion: string,
  entries: readonly GalleryEntry[]
): string {
  const articles = entries
    .map(({ registryEntry: entry, schemaName, previewName }) => {
      const id = escapeHtml(entry.id);
      const kind = escapeHtml(entry.kind);
      const version = escapeHtml(entry.version);
      const formats = escapeHtml(entry.formats.join(", "));
      const themes = escapeHtml(entry.themes.join(", "));
      const schemaHref = escapeHtml(`schemas/${schemaName}`);
      const previewHref = escapeHtml(`previews/${previewName}`);
      return `    <article data-component-id="${id}">
      <header>
        <p class="kind">${kind}</p>
        <h2>${id}</h2>
      </header>
      <dl aria-label="Component metadata">
        <div><dt>ID</dt><dd>${id}</dd></div>
        <div><dt>Kind</dt><dd>${kind}</dd></div>
        <div><dt>Version</dt><dd>${version}</dd></div>
        <div><dt>Formats</dt><dd>${formats}</dd></div>
        <div><dt>Themes</dt><dd>${themes}</dd></div>
      </dl>
      <nav aria-label="Canonical files for ${id}">
        <a href="${schemaHref}">Schema / definition</a>
        <a href="${previewHref}">Open PDF preview</a>
      </nav>
      <embed src="${previewHref}" type="application/pdf" title="${id} PDF preview">
    </article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PDF Forge Registry Gallery</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #f4f4f5; color: #18181b; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 48px 24px 80px; }
    main { width: min(1180px, 100%); margin: 0 auto; }
    h1 { margin: 0; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: -0.06em; }
    .intro { max-width: 70ch; margin: 12px 0 40px; color: #52525b; }
    .grid { display: grid; gap: 24px; }
    article { overflow: hidden; padding: 24px; border: 1px solid #d4d4d8; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px rgb(24 24 27 / 0.06); }
    article header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
    h2 { margin: 0; font-size: 1.5rem; letter-spacing: -0.04em; }
    .kind { order: 2; margin: 0; color: #71717a; font: 600 0.75rem/1 ui-monospace, monospace; text-transform: uppercase; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 20px 0; }
    dl div { min-width: 0; }
    dt { color: #71717a; font-size: 0.75rem; }
    dd { overflow-wrap: anywhere; margin: 4px 0 0; font-weight: 600; }
    nav { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
    a { color: #7c3aed; font-weight: 650; }
    embed { display: block; width: 100%; min-height: 720px; border: 1px solid #e4e4e7; border-radius: 8px; background: #fafafa; }
  </style>
</head>
<body>
  <main>
    <h1>Canonical registry gallery</h1>
    <p class="intro">Registry version ${escapeHtml(registryVersion)}. Every preview is composed from its canonical example and rendered to PDF by Playwright.</p>
    <section class="grid" aria-label="Registry entries">
${articles}
    </section>
  </main>
</body>
</html>
`;
}

async function resolveGalleryPackageRoot(
  configuredRoot?: string
): Promise<string> {
  if (configuredRoot !== undefined && configuredRoot.trim().length > 0) {
    return resolve(configuredRoot);
  }
  return discoverPackageRoot(new URL("../bin/pdf-forge.ts", import.meta.url));
}

async function assertRenderedPreviews(
  previewsDir: string,
  entries: readonly GalleryEntry[],
  renderedFiles: readonly string[]
): Promise<void> {
  const expectedNames = entries.map((entry) => entry.previewName).sort();
  const actualNames = renderedFiles.map((file) => basename(file)).sort();
  if (
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error(
      `Playwright rendered ${actualNames.length} previews; expected ${expectedNames.length}.`
    );
  }

  for (const previewName of expectedNames) {
    const bytes = await readFile(join(previewsDir, previewName));
    if (
      bytes.byteLength <= 5 ||
      new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-"
    ) {
      throw new Error(
        `Playwright preview "${previewName}" is not a nonempty PDF.`
      );
    }
  }
}

export async function generateGallery(
  options: GenerateGalleryOptions
): Promise<GenerateGalleryResult> {
  const outputDir = resolve(options.outputDir);
  await assertOutputDoesNotExist(outputDir);

  const outputParent = dirname(outputDir);
  await mkdir(outputParent, { recursive: true });
  const stageDir = await mkdtemp(
    join(outputParent, `.${basename(outputDir)}.stage-`)
  );

  try {
    const packageRoot = await resolveGalleryPackageRoot(options.packageRoot);
    const registryRoot = await realpath(join(packageRoot, "assets/registry"));
    const registry = await loadRegistry(packageRoot);
    const workPagesDir = join(stageDir, ".work-pages");
    const previewsDir = join(stageDir, "previews");
    const schemasDir = join(stageDir, "schemas");
    await Promise.all([
      mkdir(workPagesDir, { recursive: true }),
      mkdir(schemasDir, { recursive: true }),
    ]);

    const galleryEntries: GalleryEntry[] = [];
    const renderedFiles: string[] = [];
    const entriesByRenderFormat = [...registry.entries].sort((left, right) => {
      const formatOrder =
        Number(galleryFormat(left) === "slides") -
        Number(galleryFormat(right) === "slides");
      return formatOrder || left.id.localeCompare(right.id);
    });
    for (const entry of entriesByRenderFormat) {
      debug(`${entry.id}: start`);
      const example = await readCanonicalExample(registryRoot, entry);
      const theme = entry.themes[0];
      if (theme === undefined) {
        throw new Error(`Registry entry "${entry.id}" has no declared theme.`);
      }
      const format = galleryFormat(entry);
      const manifest = parseDocumentManifest({
        schemaVersion: "1",
        documentId: `gallery-${entry.id}`,
        format,
        theme,
        pages: [
          {
            id: entry.id,
            selection: { kind: entry.kind, id: entry.id },
            props: example,
          },
        ],
      });
      const page = manifest.pages[0];
      if (page === undefined) {
        throw new Error(`Gallery manifest for "${entry.id}" has no page.`);
      }
      const html = await composeDocumentPage(manifest, page, packageRoot);
      debug(`${entry.id}: composed as ${format}`);
      const entryPagesDir = join(workPagesDir, entry.id, "pages");
      const entryRenderedDir = join(workPagesDir, entry.id, "rendered");
      await mkdir(entryPagesDir, { recursive: true });
      await writeFile(join(entryPagesDir, `${entry.id}.html`), html, "utf8");
      const rendered = await renderPages({
        inputDir: entryPagesDir,
        outputDir: entryRenderedDir,
        format,
        scale: 1,
        blockNetwork: true,
      });
      debug(`${entry.id}: rendered`);
      await mkdir(previewsDir, { recursive: true });
      const previewName = `${entry.id}.pdf`;
      if (format === "docs") {
        const source = rendered.files[0];
        if (source === undefined) {
          throw new Error(`Gallery renderer produced no preview for "${entry.id}".`);
        }
        const sourcePath = isAbsolute(source)
          ? source
          : join(entryRenderedDir, source);
        await copyFile(sourcePath, join(previewsDir, previewName));
      } else {
        debug(`${entry.id}: merging slide preview`);
        await mergePages({
          inputDir: entryRenderedDir,
          outputPath: join(previewsDir, previewName),
        });
      }
      debug(`${entry.id}: preview ready`);
      renderedFiles.push(previewName);

      const schemaPath = await realpath(join(registryRoot, entry.schema));
      assertContainedPath(registryRoot, schemaPath, "schema", entry.id);
      const schemaExtension = extname(entry.schema);
      if (schemaExtension.length === 0) {
        throw new Error(
          `Registry schema for entry "${entry.id}" has no file extension.`
        );
      }
      const schemaName = `${entry.id}${schemaExtension}`;
      await copyFile(schemaPath, join(schemasDir, schemaName));
      galleryEntries.push({
        registryEntry: entry,
        schemaName,
        previewName,
      });
    }

    galleryEntries.sort((left, right) =>
      left.registryEntry.id.localeCompare(right.registryEntry.id)
    );
    await assertRenderedPreviews(
      previewsDir,
      galleryEntries,
      renderedFiles
    );
    await writeFile(
      join(stageDir, "index.html"),
      galleryIndex(registry.version, galleryEntries),
      "utf8"
    );
    await rm(workPagesDir, { recursive: true, force: true });
    await rename(stageDir, outputDir);
    debug("complete");

    return { outputDir, count: galleryEntries.length };
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }
}

async function main(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2), process.cwd());
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(USAGE);
    return 2;
  }

  try {
    const result = await generateGallery({
      outputDir: parsed.outputDir,
      packageRoot: process.env.PDF_FORGE_HOME,
    });
    console.log(
      `Generated ${result.count} registry gallery entries at ${result.outputDir}`
    );
    return 0;
  } catch (error) {
    console.error(
      "Registry gallery generation failed:",
      error instanceof Error ? error.message : String(error)
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main());
}
