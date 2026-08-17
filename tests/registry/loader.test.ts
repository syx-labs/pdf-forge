import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadRegistry } from "../../src/registry/loader";

const temporaryRoots: string[] = [];

async function createRegistryRoot(
  yaml: string,
  files: ReadonlyArray<readonly [string, string]> = []
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-registry-"));
  temporaryRoots.push(root);
  const registryRoot = join(root, "assets/registry");
  await mkdir(registryRoot, { recursive: true });
  await writeFile(join(registryRoot, "registry.yaml"), yaml, "utf-8");

  for (const [relativePath, content] of files) {
    const filePath = join(registryRoot, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }

  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("loadRegistry", () => {
  test("loads an injected package root with its effective version and sorted entries", async () => {
    const root = await createRegistryRoot(
      `version: "1"
entries:
  - id: zeta-card
    kind: primitive
    version: 1.0.0
    template: primitives/zeta-card/component.html
    schema: primitives/zeta-card/schema.json
    formats: [slides]
    themes: [ivory-editorial]
  - id: alpha-card
    kind: primitive
    version: 1.0.0
    template: primitives/alpha-card/component.html
    schema: primitives/alpha-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
`,
      [
        ["primitives/zeta-card/component.html", "<div>Zeta</div>"],
        ["primitives/zeta-card/schema.json", "{}"],
        ["primitives/alpha-card/component.html", "<div>Alpha</div>"],
        ["primitives/alpha-card/schema.json", "{}"],
      ]
    );

    const registry = await loadRegistry(root);

    expect(registry.version).toBe("1");
    expect(registry.entries.map((entry) => entry.id)).toEqual([
      "alpha-card",
      "zeta-card",
    ]);
  });

  test("returns deeply immutable entries", async () => {
    const root = await createRegistryRoot(
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs, slides]
    themes: [ivory-editorial]
`,
      [
        ["primitives/metric-card/component.html", "<div>Metric</div>"],
        ["primitives/metric-card/schema.json", "{}"],
      ]
    );

    const registry = await loadRegistry(root);
    const entry = registry.entries[0];

    expect(Object.isFrozen(registry)).toBe(true);
    expect(Object.isFrozen(registry.entries)).toBe(true);
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Object.isFrozen(entry.formats)).toBe(true);
    expect(Object.isFrozen(entry.themes)).toBe(true);
  });

  test("reports malformed YAML with the actionable registry path", async () => {
    const root = await createRegistryRoot('version: "1"\nentries: [\n');
    const registryPath = join(root, "assets/registry/registry.yaml");
    let thrown: unknown;

    try {
      await loadRegistry(root);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    if (!(thrown instanceof Error)) {
      throw new Error("Expected malformed YAML to throw an Error.");
    }
    expect(thrown.message).toContain("Failed to parse registry YAML");
    expect(thrown.message).toContain(registryPath);
  });

  test("fails closed on duplicate entry IDs", async () => {
    const root = await createRegistryRoot(
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
  - id: metric-card
    kind: primitive
    version: 2.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [slides]
    themes: [ivory-editorial]
`,
      [
        ["primitives/metric-card/component.html", "<div>Metric</div>"],
        ["primitives/metric-card/schema.json", "{}"],
      ]
    );

    await expect(loadRegistry(root)).rejects.toThrow(
      'Duplicate registry entry id "metric-card"'
    );
  });

  test("fails closed when a referenced template file is missing", async () => {
    const root = await createRegistryRoot(
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
`,
      [["primitives/metric-card/schema.json", "{}"]]
    );
    const missingTemplate = join(
      root,
      "assets/registry/primitives/metric-card/component.html"
    );

    await expect(loadRegistry(root)).rejects.toThrow(
      `Missing template file for registry entry "metric-card": "${missingTemplate}"`
    );
  });

  test("fails closed when a referenced schema file is missing", async () => {
    const root = await createRegistryRoot(
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
`,
      [["primitives/metric-card/component.html", "<div>Metric</div>"]]
    );
    const missingSchema = join(
      root,
      "assets/registry/primitives/metric-card/schema.json"
    );

    await expect(loadRegistry(root)).rejects.toThrow(
      `Missing schema file for registry entry "metric-card": "${missingSchema}"`
    );
  });

  test("resolves the canonical registry from the package root without caller cwd", async () => {
    const unrelatedCwd = await mkdtemp(
      join(tmpdir(), "pdf-forge-unrelated-cwd-")
    );
    temporaryRoots.push(unrelatedCwd);
    const loaderUrl = new URL(
      "../../src/registry/loader.ts",
      import.meta.url
    ).href;
    const script = `
      import { loadRegistry } from ${JSON.stringify(loaderUrl)};
      const registry = await loadRegistry();
      console.log(JSON.stringify({
        version: registry.version,
        entries: registry.entries.map((entry) => entry.id),
      }));
    `;

    const subprocess = Bun.spawn(["bun", "-e", script], {
      cwd: unrelatedCwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);

    expect(exitCode, stderr).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      version: "1",
      entries: ["data-table", "metric-card"],
    });
  });
});
