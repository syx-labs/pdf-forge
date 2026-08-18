import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { makePng } from "../helpers/make-png";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const PACKED_RESOURCE_MARKER = "PACKED_RESOURCE_MARKER";
let tempDir: string;
let packageRoot: string;
let rendered: string;
let npmCache: string;
let packedVersion: string;
let externalWorkDir: string;

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isUnknownRecord(value)) {
    throw new Error(`Expected ${label} to be a JSON object.`);
  }
  return value;
}

function requiredRecord(
  value: unknown,
  label: string
): Record<string, unknown> {
  if (!isUnknownRecord(value)) {
    throw new Error(`Expected ${label} to be an object.`);
  }
  return value;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Expected ${label} to be a string.`);
  }
  return value;
}

function requiredStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`Expected ${label} to be an array of strings.`);
  }
  return value;
}

type RegistryList = Readonly<{
  version: string;
  entries: readonly Readonly<{
    id: string;
    kind: string;
    version: string;
    formats: readonly string[];
    themes: readonly string[];
  }>[];
}>;

function parseRegistryList(text: string): RegistryList {
  const payload = parseJsonRecord(text, "registry list output");
  if (!Array.isArray(payload.entries)) {
    throw new Error("Expected registry list entries to be an array.");
  }
  return {
    version: requiredString(payload.version, "registry version"),
    entries: payload.entries.map((value, index) => {
      const entry = requiredRecord(value, `registry entry ${index}`);
      return {
        id: requiredString(entry.id, `registry entry ${index} id`),
        kind: requiredString(entry.kind, `registry entry ${index} kind`),
        version: requiredString(entry.version, `registry entry ${index} version`),
        formats: requiredStringArray(
          entry.formats,
          `registry entry ${index} formats`
        ),
        themes: requiredStringArray(
          entry.themes,
          `registry entry ${index} themes`
        ),
      };
    }),
  };
}

async function run(
  command: string[],
  cwd: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

function productionEnv(): Record<string, string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
  env.NODE_ENV = "production";
  delete env.PDF_FORGE_HOME;
  return env;
}

async function expectValidOnePagePdf(path: string): Promise<void> {
  const bytes = await readFile(path);
  expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
  const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1);
}

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-npm-pack-"));
  npmCache = join(tempDir, "npm-cache");
  externalWorkDir = join(tempDir, "external-workdir");
  await mkdir(externalWorkDir);

  const build = await run([process.execPath, "run", "build"], REPO_ROOT);
  expect(build.exitCode, build.stderr).toBe(0);

  const packDir = join(tempDir, "pack");
  await mkdir(packDir);
  const packed = await run(
    ["npm", "pack", "--json", "--pack-destination", packDir],
    REPO_ROOT,
    { ...process.env, npm_config_cache: npmCache }
  );
  expect(packed.exitCode, packed.stderr).toBe(0);

  const archives = (await readdir(packDir)).filter((name) => name.endsWith(".tgz"));
  expect(archives).toHaveLength(1);
  const archive = archives[0];
  if (archive === undefined) {
    throw new Error("Expected npm pack to produce one archive.");
  }
  const unpackDir = join(tempDir, "unpacked");
  await mkdir(unpackDir);
  const extracted = await run(
    ["tar", "-xzf", join(packDir, archive), "-C", unpackDir],
    tempDir
  );
  expect(extracted.exitCode, extracted.stderr).toBe(0);

  packageRoot = join(unpackDir, "package");
  const packedPackage = parseJsonRecord(
    await readFile(join(packageRoot, "package.json"), "utf-8"),
    "packed package.json"
  );
  const packedBin = requiredRecord(packedPackage.bin, "packed package bin");
  expect(packedBin["pdf-forge"]).toBe("dist/bin/pdf-forge.js");
  expect(packedPackage.exports).toEqual({
    "./mcp": "./dist/src/mcp/server.js",
  });
  packedVersion = requiredString(packedPackage.version, "packed package version");
  expect(packedVersion.length).toBeGreaterThan(0);
  const designSystem = join(
    packageRoot,
    "skills/pdf-forge/references/design-system.md"
  );
  await writeFile(
    designSystem,
    `${await readFile(designSystem, "utf-8")}\n${PACKED_RESOURCE_MARKER}\n`,
    "utf-8"
  );

  const installed = await run(
    [
      "npm",
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
    ],
    packageRoot,
    { ...productionEnv(), npm_config_cache: npmCache }
  );
  expect(installed.exitCode, installed.stderr).toBe(0);

  rendered = join(tempDir, "rendered");
  await mkdir(rendered);
  await writeFile(join(rendered, "01.png"), makePng(160, 90));
}, 60_000);

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("packed npm CLI", () => {
  test("tarball ships canonical registry assets and source-required internals", async () => {
    const expectedFiles = [
      "assets/registry/registry.yaml",
      "assets/registry/primitives/data-table/component.html",
      "assets/registry/primitives/data-table/schema.json",
      "assets/registry/primitives/data-table/example.json",
      "assets/registry/primitives/metric-card/component.html",
      "assets/registry/primitives/metric-card/schema.json",
      "assets/registry/primitives/metric-card/example.json",
      "assets/registry/blocks/executive-report/template.html",
      "assets/registry/blocks/executive-report/block.yaml",
      "assets/registry/blocks/executive-report/example.json",
      "assets/registry/themes/ivory-editorial.json",
      "assets/themes/ivory-editorial.yaml",
      "src/registry/loader.ts",
      "src/registry/compose.ts",
      "src/registry/receipt.ts",
      "src/data/provider-registry.ts",
      "src/data/providers/static-json.ts",
      "src/data/bindings/executive-report.ts",
    ];

    for (const relativePath of expectedFiles) {
      const file = await stat(join(packageRoot, relativePath));
      expect(file.isFile(), relativePath).toBe(true);
    }
  });

  test("built CLI lists and inspects the packaged registry from an external cwd", async () => {
    const builtCli = join(packageRoot, "dist/bin/pdf-forge.js");
    const listed = await run(
      ["node", builtCli, "registry", "list", "--json"],
      externalWorkDir,
      productionEnv()
    );
    expect(listed.exitCode, listed.stderr).toBe(0);
    expect(listed.stderr).toBe("");
    const registry = parseRegistryList(listed.stdout);
    expect(registry.version).toBe("1");
    expect(registry.entries.map(({ id }) => id)).toEqual([
      "data-table",
      "executive-report",
      "metric-card",
    ]);

    const inspected = await run(
      [
        "node",
        builtCli,
        "registry",
        "inspect",
        "executive-report",
        "--json",
      ],
      externalWorkDir,
      productionEnv()
    );
    expect(inspected.exitCode, inspected.stderr).toBe(0);
    expect(inspected.stderr).toBe("");
    const entry = parseJsonRecord(inspected.stdout, "registry inspect output");
    expect(entry).toEqual({
      id: "executive-report",
      kind: "block",
      version: "1.0.0",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
      template: "blocks/executive-report/template.html",
      schema: "blocks/executive-report/block.yaml",
    });
    expect(isAbsolute(requiredString(entry.template, "registry template"))).toBe(false);
    expect(isAbsolute(requiredString(entry.schema, "registry schema"))).toBe(false);
    expect(`${listed.stdout}${listed.stderr}${inspected.stdout}${inspected.stderr}`).not.toContain(
      tempDir
    );
  }, 60_000);

  test("published skill wrapper lists the packaged registry from an external cwd", async () => {
    const wrapper = join(packageRoot, "skills/pdf-forge/bin/pdf-forge");
    const listed = await run(
      [wrapper, "registry", "list", "--json"],
      externalWorkDir,
      productionEnv()
    );
    expect(listed.exitCode, listed.stderr).toBe(0);
    expect(listed.stderr).toBe("");
    const registry = parseRegistryList(listed.stdout);
    expect(registry.version).toBe("1");
    expect(registry.entries.map(({ id }) => id)).toEqual([
      "data-table",
      "executive-report",
      "metric-card",
    ]);
    expect(`${listed.stdout}${listed.stderr}`).not.toContain(tempDir);
  }, 60_000);

  test("built CLI composes a packaged fixture and emits a path-safe receipt", async () => {
    const fixtureName = "executive-report-snapshot.json";
    const fixturePath = join(externalWorkDir, fixtureName);
    const sourceFixture = join(
      REPO_ROOT,
      "tests/fixtures/data/executive-report-snapshot.json"
    );
    const output = join(externalWorkDir, "packed-executive-report.pdf");
    const receiptPath = join(
      externalWorkDir,
      "packed-executive-report.receipt.json"
    );
    const rawSecret = "packed-compose-secret-must-not-leak";
    await copyFile(sourceFixture, fixturePath);
    const fixture = parseJsonRecord(
      await readFile(fixturePath, "utf-8"),
      "external compose fixture"
    );
    expect(fixture.providerId).toBe("static-json");

    const composed = await run(
      [
        "node",
        join(packageRoot, "dist/bin/pdf-forge.js"),
        "compose",
        "executive-report",
        "--data",
        fixtureName,
        "--theme",
        "ivory-editorial",
        "--output",
        basename(output),
        "--receipt",
        basename(receiptPath),
      ],
      externalWorkDir,
      {
        ...productionEnv(),
        PDF_FORGE_DEEPSQL_AUTH_TOKEN: rawSecret,
      }
    );
    expect(composed.exitCode, composed.stderr).toBe(0);
    expect(composed.stderr).toBe("");

    const pdfBytes = await readFile(output);
    expect(new TextDecoder().decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

    const receiptText = await readFile(receiptPath, "utf-8");
    const receipt = parseJsonRecord(receiptText, "packed compose receipt");
    const receiptOutput = requiredRecord(receipt.output, "receipt output");
    expect(Object.keys(receipt).sort()).toEqual([
      "componentIds",
      "componentVersions",
      "createdAt",
      "documentId",
      "format",
      "output",
      "registryVersion",
      "schemaVersion",
      "snapshotSha256",
      "theme",
      "warnings",
    ]);
    expect(receipt.schemaVersion).toBe("1");
    expect(receipt.componentIds).toEqual([
      "data-table",
      "executive-report",
      "metric-card",
    ]);
    expect(receipt.componentVersions).toEqual({
      "data-table": "1.0.0",
      "executive-report": "1.0.0",
      "metric-card": "1.0.0",
    });
    expect(receiptOutput.fileName).toBe(basename(output));
    expect(receiptOutput.pageCount).toBe(pdf.getPageCount());
    for (const forbidden of [
      rawSecret,
      packageRoot,
      externalWorkDir,
      fixturePath,
      "static-json",
      "providerId",
      "sourceRef",
      "North",
      "South",
      "Protect enterprise retention.",
      "Accelerate qualified pipeline.",
    ]) {
      expect(receiptText).not.toContain(forbidden);
    }
  }, 60_000);

  test("built doctor reports packaged capabilities without paths or raw secrets", async () => {
    const rawSecret = "packed-doctor-secret-must-not-leak";
    const doctor = await run(
      ["node", join(packageRoot, "dist/bin/pdf-forge.js"), "doctor", "--json"],
      externalWorkDir,
      {
        ...productionEnv(),
        PDF_FORGE_DEEPSQL_BASE_URL: "https://doctor.invalid/deepsql",
        PDF_FORGE_DEEPSQL_AUTH_TOKEN: rawSecret,
        PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS: "packed-doctor-query",
      }
    );
    expect(doctor.exitCode, doctor.stderr).toBe(0);
    expect(doctor.stderr).toBe("");
    const report = parseJsonRecord(doctor.stdout, "doctor output");
    const registry = requiredRecord(report.registry, "doctor registry");
    expect(registry.version).toBe("1");
    if (!Array.isArray(report.providers)) {
      throw new Error("Expected doctor providers to be an array.");
    }
    const providers = report.providers.map((value, index) =>
      requiredRecord(value, `doctor provider ${index}`)
    );
    const deepsql = providers.find((provider) => provider.id === "deepsql");
    const staticJson = providers.find((provider) => provider.id === "static-json");
    expect(deepsql?.enabled).toBe(false);
    expect(staticJson?.enabled).toBe(true);
    expect(doctor.stdout).toContain("[REDACTED]");
    for (const forbidden of [rawSecret, packageRoot, externalWorkDir, tempDir]) {
      expect(`${doctor.stdout}${doctor.stderr}`).not.toContain(forbidden);
    }
  }, 60_000);

  test("unpacked npm bin merges a PNG with production dependencies", async () => {
    const output = join(tempDir, "packed-output.pdf");
    const merged = await run(
      [
        "node",
        join(packageRoot, "dist/bin/pdf-forge.js"),
        "merge",
        rendered,
        "--output",
        output,
      ],
      externalWorkDir,
      productionEnv()
    );
    expect(merged.exitCode, merged.stderr).toBe(0);
    await expectValidOnePagePdf(output);
  }, 60_000);

  test("published skill wrapper runs help and merge with a clean production env", async () => {
    const wrapper = join(packageRoot, "skills/pdf-forge/bin/pdf-forge");
    const help = await run([wrapper, "--help"], externalWorkDir, productionEnv());
    expect(help.exitCode, help.stderr).toBe(0);
    expect(help.stdout).toContain("pdf-forge merge");

    const output = join(tempDir, "skill-wrapper-output.pdf");
    const merged = await run(
      [wrapper, "merge", rendered, "--output", output],
      externalWorkDir,
      productionEnv()
    );
    expect(merged.exitCode, merged.stderr).toBe(0);
    await expectValidOnePagePdf(output);
  }, 60_000);

  test("published skill wrapper serves MCP from packaged source", async () => {
    const transport = new StdioClientTransport({
      command: join(packageRoot, "skills/pdf-forge/bin/pdf-forge"),
      args: ["serve"],
      cwd: tempDir,
      env: productionEnv(),
      stderr: "pipe",
    });
    const client = new Client({ name: "source-serve-probe", version: "1.0.0" });
    try {
      await client.connect(transport);
      const resource = await client.readResource({
        uri: "pdf-forge://design-system",
      });
      expect(resource.contents[0]?.text).toContain(PACKED_RESOURCE_MARKER);
      expect(client.getServerVersion()?.version).toBe(packedVersion);
      expect(client.getServerVersion()?.version).not.toBe("0.0.0");
    } finally {
      await client.close();
    }
  }, 60_000);

  test("built MCP reads a packaged resource and reports the packaged version", async () => {
    const probePath = join(packageRoot, "mcp-probe.mjs");
    await writeFile(
      probePath,
      `import { createServer } from "./dist/src/mcp/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const server = await createServer();
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "pack-probe", version: "1.0.0" });
await client.connect(clientTransport);
const resource = await client.readResource({ uri: "pdf-forge://design-system" });
console.log("MCP_PROBE=" + JSON.stringify({
  text: resource.contents[0]?.text,
  version: client.getServerVersion()?.version,
}));
await client.close();
await server.close();
`,
      "utf-8"
    );

    const probe = await run(["node", probePath], packageRoot, productionEnv());
    expect(probe.exitCode, probe.stderr).toBe(0);
    const line = probe.stdout
      .split("\n")
      .find((value) => value.startsWith("MCP_PROBE="));
    if (line === undefined) {
      throw new Error("Expected the packaged MCP probe output marker.");
    }
    const result = parseJsonRecord(
      line.slice("MCP_PROBE=".length),
      "packaged MCP probe"
    );
    expect(result.text).toContain(PACKED_RESOURCE_MARKER);
    expect(result.version).toBe(packedVersion);
    expect(result.version).not.toBe("0.0.0");
  }, 60_000);
});
