import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
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
  const unpackDir = join(tempDir, "unpacked");
  await mkdir(unpackDir);
  const extracted = await run(
    ["tar", "-xzf", join(packDir, archives[0]), "-C", unpackDir],
    tempDir
  );
  expect(extracted.exitCode, extracted.stderr).toBe(0);

  packageRoot = join(unpackDir, "package");
  const packedPackage = JSON.parse(
    await readFile(join(packageRoot, "package.json"), "utf-8")
  ) as { bin?: Record<string, string>; version?: string };
  expect(packedPackage.bin?.["pdf-forge"]).toBe("dist/bin/pdf-forge.js");
  expect(packedPackage.version).toBeTruthy();
  packedVersion = packedPackage.version!;
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
      tempDir,
      productionEnv()
    );
    expect(merged.exitCode, merged.stderr).toBe(0);
    await expectValidOnePagePdf(output);
  }, 60_000);

  test("published skill wrapper runs help and merge with a clean production env", async () => {
    const wrapper = join(packageRoot, "skills/pdf-forge/bin/pdf-forge");
    const help = await run([wrapper, "--help"], tempDir, productionEnv());
    expect(help.exitCode, help.stderr).toBe(0);
    expect(help.stdout).toContain("pdf-forge merge");

    const output = join(tempDir, "skill-wrapper-output.pdf");
    const merged = await run(
      [wrapper, "merge", rendered, "--output", output],
      tempDir,
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
    expect(line).toBeTruthy();
    const result = JSON.parse(line!.slice("MCP_PROBE=".length)) as {
      text?: string;
      version?: string;
    };
    expect(result.text).toContain(PACKED_RESOURCE_MARKER);
    expect(result.version).toBe(packedVersion);
    expect(result.version).not.toBe("0.0.0");
  }, 60_000);
});
