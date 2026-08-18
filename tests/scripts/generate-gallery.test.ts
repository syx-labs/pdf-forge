import { afterEach, describe, expect, test } from "bun:test";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dir, "../..");
const SCRIPT = join(PACKAGE_ROOT, "scripts/generate-gallery.ts");
const REGISTRY_ROOT = join(PACKAGE_ROOT, "assets/registry");
const EXPECTED_ENTRIES = [
  {
    id: "data-table",
    kind: "primitive",
    version: "1.0.0",
    formats: ["docs", "slides"],
    themes: ["ivory-editorial"],
    schema: "primitives/data-table/schema.json",
  },
  {
    id: "executive-report",
    kind: "block",
    version: "1.0.0",
    formats: ["docs", "slides"],
    themes: ["ivory-editorial"],
    schema: "blocks/executive-report/block.yaml",
  },
  {
    id: "metric-card",
    kind: "primitive",
    version: "1.0.0",
    formats: ["docs", "slides"],
    themes: ["ivory-editorial"],
    schema: "primitives/metric-card/schema.json",
  },
] as const;
const temporaryRoots: string[] = [];

async function makeExternalCwd(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-gallery-"));
  temporaryRoots.push(root);
  return root;
}

async function runGenerator(
  cwd: string,
  args: readonly string[],
  packageRoot?: string,
  debug = false
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const env = {
    HOME: process.env.HOME ?? tmpdir(),
    PATH: process.env.PATH ?? "",
    TMPDIR: process.env.TMPDIR ?? tmpdir(),
    ...(packageRoot === undefined ? {} : { PDF_FORGE_HOME: packageRoot }),
    ...(debug ? { PDF_FORGE_GALLERY_DEBUG: "1" } : {}),
  };

  const proc = Bun.spawn([process.execPath, "run", SCRIPT, ...args], {
    cwd,
    env,
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

async function relativeTree(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);
    paths.push(relativePath);
    if (entry.isDirectory()) {
      paths.push(...(await relativeTree(root, relativePath)));
    }
  }
  return paths.sort();
}

async function pathExists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("canonical registry gallery generator", () => {
  test("generates the sorted canonical gallery with real Playwright PDFs from an external cwd", async () => {
    const externalCwd = await makeExternalCwd();
    const outputRelative = "generated/registry-gallery";
    const outputDir = join(externalCwd, outputRelative);

    const result = await runGenerator(externalCwd, ["--output", outputRelative]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(outputDir);
    expect(result.stdout).toContain("3");
    expect(result.stdout).not.toContain(PACKAGE_ROOT);

    const index = await readFile(join(outputDir, "index.html"), "utf8");
    const articleIds = Array.from(
      index.matchAll(/<article data-component-id="([^"]+)">/gu),
      (match) => match[1]
    );
    expect(articleIds).toEqual(EXPECTED_ENTRIES.map((entry) => entry.id));
    expect(index).not.toContain(PACKAGE_ROOT);

    for (const entry of EXPECTED_ENTRIES) {
      const schemaName = `${entry.id}${extname(entry.schema)}`;
      const schemaHref = `schemas/${schemaName}`;
      const previewHref = `previews/${entry.id}.pdf`;
      expect(index).toContain(`data-component-id="${entry.id}"`);
      expect(index).toContain(`>${entry.id}<`);
      expect(index).toContain(`>${entry.kind}<`);
      expect(index).toContain(`>${entry.version}<`);
      expect(index).toContain(`>${entry.formats.join(", ")}<`);
      expect(index).toContain(`>${entry.themes.join(", ")}<`);
      expect(index).toContain(`href="${schemaHref}"`);
      expect(index).toContain(`href="${previewHref}"`);
      expect(index).toContain(`src="${previewHref}"`);

      const previewBytes = await readFile(join(outputDir, previewHref));
      expect(previewBytes.byteLength).toBeGreaterThan(5);
      expect(new TextDecoder().decode(previewBytes.subarray(0, 5))).toBe("%PDF-");

      const [canonicalSchema, copiedSchema] = await Promise.all([
        readFile(join(REGISTRY_ROOT, entry.schema)),
        readFile(join(outputDir, schemaHref)),
      ]);
      expect(copiedSchema).toEqual(canonicalSchema);
    }

    const tree = await relativeTree(outputDir);
    expect(tree).toEqual([
      "index.html",
      "previews",
      "previews/data-table.pdf",
      "previews/executive-report.pdf",
      "previews/metric-card.pdf",
      "schemas",
      "schemas/data-table.json",
      "schemas/executive-report.yaml",
      "schemas/metric-card.json",
    ]);
    expect(tree.every((path) => !path.split("/").some((part) => part.startsWith(".")))).toBe(true);
    expect((await stat(outputDir)).isDirectory()).toBe(true);
  }, 60_000);

  test("rejects a pre-existing output directory without mutating it", async () => {
    const externalCwd = await makeExternalCwd();
    const outputRelative = "existing/gallery";
    const outputDir = join(externalCwd, outputRelative);
    const sentinelPath = join(outputDir, "sentinel.txt");
    await mkdir(outputDir, { recursive: true });
    await writeFile(sentinelPath, "leave this untouched\n", "utf8");
    const beforeTree = await relativeTree(outputDir);
    const beforeSentinel = await readFile(sentinelPath);

    const result = await runGenerator(externalCwd, ["--output", outputRelative]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Output directory already exists");
    expect(await relativeTree(outputDir)).toEqual(beforeTree);
    expect(await readFile(sentinelPath)).toEqual(beforeSentinel);
  }, 60_000);

  test("renders a slides-only registry entry and still publishes a PDF preview", async () => {
    const externalCwd = await makeExternalCwd();
    const packageRoot = join(externalCwd, "package-root");
    const copiedRegistryRoot = join(packageRoot, "assets/registry");
    await cp(REGISTRY_ROOT, copiedRegistryRoot, { recursive: true });
    const registryPath = join(copiedRegistryRoot, "registry.yaml");
    const registryText = await readFile(registryPath, "utf8");
    await writeFile(
      registryPath,
      registryText.replace(
        "id: executive-report\n    kind: block\n    version: 1.0.0\n    template: blocks/executive-report/template.html\n    schema: blocks/executive-report/block.yaml\n    formats: [docs, slides]",
        "id: executive-report\n    kind: block\n    version: 1.0.0\n    template: blocks/executive-report/template.html\n    schema: blocks/executive-report/block.yaml\n    formats: [slides]"
      ),
      "utf8"
    );
    const outputRelative = "generated/slides-only";
    const result = await runGenerator(
      externalCwd,
      ["--output", outputRelative],
      packageRoot,
      true
    );

    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toContain("gallery: complete");
    const preview = await readFile(
      join(externalCwd, outputRelative, "previews/executive-report.pdf")
    );
    expect(new TextDecoder().decode(preview.subarray(0, 5))).toBe("%PDF-");
  }, 120_000);

  test("fails closed when a copied registry package is missing an example", async () => {
    const externalCwd = await makeExternalCwd();
    const packageRoot = join(externalCwd, "package-root");
    await cp(REGISTRY_ROOT, join(packageRoot, "assets/registry"), {
      recursive: true,
    });
    await rm(
      join(
        packageRoot,
        "assets/registry/primitives/data-table/example.json"
      )
    );
    const outputRelative = "generated/missing-example";
    const outputDir = join(externalCwd, outputRelative);

    const result = await runGenerator(
      externalCwd,
      ["--output", outputRelative],
      packageRoot
    );

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      'Missing canonical example.json for registry entry "data-table"'
    );
    expect(await pathExists(outputDir)).toBe(false);
    const outputParent = join(externalCwd, "generated");
    expect(
      (await readdir(outputParent)).every(
        (name: string) => !name.startsWith(".")
      )
    ).toBe(true);
  }, 60_000);

  test("rejects invalid CLI arguments with exit code 2, actionable usage, and no output", async () => {
    const externalCwd = await makeExternalCwd();
    const invalidCases: readonly (readonly string[])[] = [
      [],
      ["--output"],
      ["--output", ""],
      ["--output", "one", "--output", "two"],
      ["--unknown", "value"],
      ["unexpected", "--output", "three"],
      ["--output", "four", "unexpected"],
      ["--help"],
    ];

    for (const args of invalidCases) {
      const result = await runGenerator(externalCwd, args);
      expect(result.exitCode, args.join(" ")).toBe(2);
      expect(result.stdout, args.join(" ")).toBe("");
      expect(result.stderr, args.join(" ")).toContain(
        "Usage: bun run scripts/generate-gallery.ts --output <dir>"
      );
    }
    for (const output of ["one", "two", "three", "four"]) {
      expect(await pathExists(join(externalCwd, output))).toBe(false);
    }
  }, 60_000);

  test("documents canonical sources, exact generation command, evidence, layout, and non-commit policy", async () => {
    const documentation = await readFile(
      join(PACKAGE_ROOT, "docs/registry/README.md"),
      "utf8"
    );

    expect(documentation).toContain("assets/registry/registry.yaml");
    expect(documentation).toContain("example.json");
    expect(documentation).toContain(
      "bun run scripts/generate-gallery.ts --output .artifacts/registry-gallery"
    );
    expect(documentation).toContain("index.html");
    expect(documentation).toContain("previews/<id>.pdf");
    expect(documentation).toContain("schemas/<id>.<ext>");
    expect(documentation).toContain("canonical composer");
    expect(documentation).toContain("Playwright");
    expect(documentation).toContain("must not be committed");
    expect(documentation).toContain(
      "Adding a registry entry requires a colocated `example.json`"
    );
    expect(documentation).toContain("generation failure blocks");
  }, 60_000);
});
