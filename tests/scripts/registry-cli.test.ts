import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(PACKAGE_ROOT, "bin/pdf-forge.ts");

let externalCwd: string;

async function runCli(
  args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd: externalCwd,
    env: {
      HOME: process.env.HOME ?? tmpdir(),
      PATH: process.env.PATH ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
    },
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

beforeAll(async () => {
  externalCwd = await mkdtemp(join(tmpdir(), "pdf-forge-registry-cli-"));
});

afterAll(async () => {
  await rm(externalCwd, { recursive: true, force: true });
});

describe("pdf-forge registry CLI", () => {
  test("documents registry discovery in root and nested help", async () => {
    const rootHelp = await runCli(["--help"]);
    expect(rootHelp.exitCode).toBe(0);
    expect(rootHelp.stdout).toContain("registry list");
    expect(rootHelp.stdout).toContain("registry inspect");

    const registryHelp = await runCli(["registry", "--help"]);
    expect(registryHelp.exitCode).toBe(0);
    expect(registryHelp.stdout).toContain("pdf-forge registry list [--json]");
    expect(registryHelp.stdout).toContain(
      "pdf-forge registry inspect <id> [--json]"
    );

    expect(`${rootHelp.stdout}${rootHelp.stderr}`).not.toContain(PACKAGE_ROOT);
    expect(`${registryHelp.stdout}${registryHelp.stderr}`).not.toContain(
      PACKAGE_ROOT
    );
  });

  test("lists the sorted public registry in human and stable JSON forms", async () => {
    const human = await runCli(["registry", "list"]);
    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe("");
    expect(human.stdout).toContain("Registry version: 1");
    expect(human.stdout.indexOf("data-table")).toBeLessThan(
      human.stdout.indexOf("executive-report")
    );
    expect(human.stdout.indexOf("executive-report")).toBeLessThan(
      human.stdout.indexOf("metric-card")
    );

    const firstJson = await runCli(["registry", "list", "--json"]);
    const secondJson = await runCli(["registry", "list", "--json"]);
    expect(firstJson.exitCode).toBe(0);
    expect(firstJson.stderr).toBe("");
    expect(firstJson.stdout).toBe(secondJson.stdout);
    expect(firstJson.stdout.trim().split("\n")).toHaveLength(1);

    const payload = JSON.parse(firstJson.stdout);
    expect(payload).toEqual({
      version: "1",
      entries: [
        {
          id: "data-table",
          kind: "primitive",
          version: "1.0.0",
          formats: ["docs", "slides"],
          themes: ["ivory-editorial"],
        },
        {
          id: "executive-report",
          kind: "block",
          version: "1.0.0",
          formats: ["docs", "slides"],
          themes: ["ivory-editorial"],
        },
        {
          id: "metric-card",
          kind: "primitive",
          version: "1.0.0",
          formats: ["docs", "slides"],
          themes: ["ivory-editorial"],
        },
      ],
    });
    expect(`${human.stdout}${human.stderr}`).not.toContain(PACKAGE_ROOT);
    expect(`${firstJson.stdout}${firstJson.stderr}`).not.toContain(PACKAGE_ROOT);
  });

  test("inspects one entry with relative metadata in human and JSON forms", async () => {
    const human = await runCli(["registry", "inspect", "executive-report"]);
    expect(human.exitCode).toBe(0);
    expect(human.stderr).toBe("");
    expect(human.stdout).toContain("executive-report (block) v1.0.0");
    expect(human.stdout).toContain(
      "Template: blocks/executive-report/template.html"
    );
    expect(human.stdout).toContain(
      "Schema: blocks/executive-report/block.yaml"
    );

    const jsonLast = await runCli([
      "registry",
      "inspect",
      "executive-report",
      "--json",
    ]);
    const jsonFirst = await runCli([
      "registry",
      "inspect",
      "--json",
      "executive-report",
    ]);
    expect(jsonLast.exitCode).toBe(0);
    expect(jsonLast.stderr).toBe("");
    expect(jsonLast.stdout).toBe(jsonFirst.stdout);
    expect(JSON.parse(jsonLast.stdout)).toEqual({
      id: "executive-report",
      kind: "block",
      version: "1.0.0",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
      template: "blocks/executive-report/template.html",
      schema: "blocks/executive-report/block.yaml",
    });

    expect(`${human.stdout}${human.stderr}`).not.toContain(PACKAGE_ROOT);
    expect(`${jsonLast.stdout}${jsonLast.stderr}`).not.toContain(PACKAGE_ROOT);
  });

  test("reports an unknown ID with sorted alternatives and exit code 2", async () => {
    const result = await runCli(["registry", "inspect", "not-shipped"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain('Unknown registry entry "not-shipped"');
    expect(result.stderr).toContain(
      "Available IDs: data-table, executive-report, metric-card"
    );
    expect(result.stderr).toContain(
      "pdf-forge registry inspect <id> [--json]"
    );
    expect(result.stderr).not.toContain(PACKAGE_ROOT);
  });

  test("rejects invalid nested commands, arguments, and flags with help", async () => {
    const cases = [
      {
        args: ["registry", "list", "unexpected"],
        message: 'Unexpected argument "unexpected"',
      },
      {
        args: ["registry", "list", "--unknown"],
        message: 'Unknown option "--unknown"',
      },
      {
        args: ["registry", "list", "--json", "--json"],
        message: 'Duplicate option "--json"',
      },
      {
        args: ["registry", "inspect"],
        message: "Missing registry entry ID",
      },
      {
        args: ["registry", "inspect", "data-table", "extra"],
        message: 'Unexpected argument "extra"',
      },
      {
        args: ["registry", "inspect", "data-table", "--unknown"],
        message: 'Unknown option "--unknown"',
      },
      {
        args: [
          "registry",
          "inspect",
          "--json",
          "data-table",
          "--json",
        ],
        message: 'Duplicate option "--json"',
      },
      {
        args: ["registry", "unknown"],
        message: 'Unknown registry subcommand "unknown"',
      },
      {
        args: ["registry", "--help", "extra"],
        message: 'Unexpected registry argument "extra"',
      },
    ];

    for (const invalid of cases) {
      const result = await runCli(invalid.args);
      expect(result.exitCode, invalid.args.join(" ")).toBe(2);
      expect(result.stdout, invalid.args.join(" ")).toBe("");
      expect(result.stderr, invalid.args.join(" ")).toContain(invalid.message);
      expect(result.stderr, invalid.args.join(" ")).toContain("Usage:");
      expect(result.stderr, invalid.args.join(" ")).not.toContain(PACKAGE_ROOT);
    }
  });
});
