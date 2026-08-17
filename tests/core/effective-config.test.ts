import { describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inspectEffectiveConfig } from "../../src/core/effective-config.js";

const PACKAGE_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(PACKAGE_ROOT, "bin/pdf-forge.ts");

const EXPECTED_LIMITS = {
  maxRows: 10_000,
  maxColumns: 100,
  maxEncodedBytes: 5_242_880,
};

const EXPECTED_CONFIGURED_REPORT = {
  schemaVersion: "1",
  registry: { version: "1" },
  limits: EXPECTED_LIMITS,
  providers: [
    {
      id: "deepsql",
      enabled: false,
      configuration: {
        endpointConfigured: true,
        authToken: "[REDACTED]",
        allowlistConfigured: true,
        timeoutConfigured: true,
      },
    },
    {
      id: "static-json",
      enabled: true,
    },
  ],
};

describe("inspectEffectiveConfig", () => {
  test("reports the real registry, limits, and sorted provider capabilities", async () => {
    const effectiveConfig = await inspectEffectiveConfig({
      packageRoot: PACKAGE_ROOT,
      environment: {
        PDF_FORGE_DEEPSQL_BASE_URL: "https://fake-test.invalid/deepsql",
        PDF_FORGE_DEEPSQL_AUTH_TOKEN: "fake-test-auth-token-do-not-use",
        PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS: "fake-query-one,fake-query-two",
        PDF_FORGE_DEEPSQL_TIMEOUT_MS: "4321",
      },
    });

    expect(effectiveConfig).toEqual(EXPECTED_CONFIGURED_REPORT);
    expect(effectiveConfig.providers.map(({ id }) => id)).toEqual([
      "deepsql",
      "static-json",
    ]);
  });

  test("redacts configured DeepSQL values from the serializable report", async () => {
    const rawToken = "fake-test-token-raw-do-not-use";
    const rawEndpoint = "https://fake-secret-endpoint.invalid/deepsql";
    const rawAllowlist = "fake-secret-query-one,fake-secret-query-two";
    const unrelatedValue = "fake-unrelated-environment-secret-do-not-use";
    const effectiveConfig = await inspectEffectiveConfig({
      packageRoot: PACKAGE_ROOT,
      environment: {
        PDF_FORGE_DEEPSQL_BASE_URL: rawEndpoint,
        PDF_FORGE_DEEPSQL_AUTH_TOKEN: rawToken,
        PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS: rawAllowlist,
        PDF_FORGE_DEEPSQL_TIMEOUT_MS: "9876",
        UNRELATED_TEST_VARIABLE: unrelatedValue,
      },
    });

    const deepsql = effectiveConfig.providers.find(
      ({ id }) => id === "deepsql"
    );
    expect(deepsql).toEqual({
      id: "deepsql",
      enabled: false,
      configuration: {
        endpointConfigured: true,
        authToken: "[REDACTED]",
        allowlistConfigured: true,
        timeoutConfigured: true,
      },
    });

    const serialized = JSON.stringify(effectiveConfig);
    expect(serialized).toContain("[REDACTED]");
    for (const forbidden of [
      rawToken,
      rawEndpoint,
      rawAllowlist,
      unrelatedValue,
      PACKAGE_ROOT,
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test("reports absent DeepSQL variables without claiming the provider is enabled", async () => {
    const effectiveConfig = await inspectEffectiveConfig({
      packageRoot: PACKAGE_ROOT,
      environment: {},
    });

    expect(effectiveConfig.providers).toEqual([
      {
        id: "deepsql",
        enabled: false,
        configuration: {
          endpointConfigured: false,
          authToken: null,
          allowlistConfigured: false,
          timeoutConfigured: false,
        },
      },
      {
        id: "static-json",
        enabled: true,
      },
    ]);
  });

  test("deep-freezes the report without mutating the supplied environment", async () => {
    const environment = Object.freeze({
      PDF_FORGE_DEEPSQL_BASE_URL: "https://fake-frozen.invalid/deepsql",
      PDF_FORGE_DEEPSQL_AUTH_TOKEN: "fake-frozen-token-do-not-use",
      PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS: "fake-frozen-query",
      PDF_FORGE_DEEPSQL_TIMEOUT_MS: "1234",
      UNRELATED_TEST_VARIABLE: "fake-frozen-unrelated-value",
    });
    const originalEnvironment = { ...environment };

    const effectiveConfig = await inspectEffectiveConfig({
      packageRoot: PACKAGE_ROOT,
      environment,
    });

    expect(environment).toEqual(originalEnvironment);
    expect(Object.isFrozen(effectiveConfig)).toBe(true);
    expect(Object.isFrozen(effectiveConfig.registry)).toBe(true);
    expect(Object.isFrozen(effectiveConfig.limits)).toBe(true);
    expect(Object.isFrozen(effectiveConfig.providers)).toBe(true);
    for (const provider of effectiveConfig.providers) {
      expect(Object.isFrozen(provider)).toBe(true);
      if ("configuration" in provider) {
        expect(Object.isFrozen(provider.configuration)).toBe(true);
      }
    }
    expect(Reflect.set(effectiveConfig.limits, "maxRows", 1)).toBe(false);
    expect(effectiveConfig.limits).toEqual(EXPECTED_LIMITS);
  });

  test("rejects malformed option boundaries without reflecting raw values", async () => {
    const rawValue = "fake-invalid-boundary-value-do-not-use";
    const malformedOptions: unknown[] = [
      null,
      {},
      { packageRoot: "" },
      { packageRoot: PACKAGE_ROOT, unexpected: rawValue },
      { packageRoot: PACKAGE_ROOT, environment: null },
      {
        packageRoot: PACKAGE_ROOT,
        environment: { PDF_FORGE_DEEPSQL_AUTH_TOKEN: { rawValue } },
      },
    ];

    for (const options of malformedOptions) {
      try {
        await Reflect.apply(inspectEffectiveConfig, undefined, [options]);
        throw new Error("Expected malformed effective config options to fail.");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const message = error instanceof Error ? error.message : String(error);
        expect(message).toBe("Invalid effective config inspection options.");
        expect(message).not.toContain(rawValue);
      }
    }
  });
});

describe("pdf-forge doctor CLI", () => {
  test("prints only secret-safe effective JSON from an external working directory", async () => {
    const externalCwd = await mkdtemp(join(tmpdir(), "pdf-forge-doctor-"));
    const rawToken = "fake-cli-token-raw-do-not-use";
    const rawEndpoint = "https://fake-cli-endpoint.invalid/deepsql";
    const rawAllowlist = "fake-cli-query-one,fake-cli-query-two";

    try {
      const proc = Bun.spawn(
        [process.execPath, "run", CLI, "doctor", "--json"],
        {
          cwd: externalCwd,
          env: {
            HOME: process.env.HOME ?? tmpdir(),
            PATH: process.env.PATH ?? "",
            TMPDIR: process.env.TMPDIR ?? tmpdir(),
            PDF_FORGE_DEEPSQL_BASE_URL: rawEndpoint,
            PDF_FORGE_DEEPSQL_AUTH_TOKEN: rawToken,
            PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS: rawAllowlist,
            PDF_FORGE_DEEPSQL_TIMEOUT_MS: "2468",
          },
          stdout: "pipe",
          stderr: "pipe",
        }
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      expect(exitCode, stderr).toBe(0);
      expect(stderr).toBe("");
      expect(JSON.parse(stdout)).toEqual(EXPECTED_CONFIGURED_REPORT);
      expect(stdout).toBe(
        `${JSON.stringify(EXPECTED_CONFIGURED_REPORT, null, 2)}\n`
      );
      for (const forbidden of [
        rawToken,
        rawEndpoint,
        rawAllowlist,
        PACKAGE_ROOT,
      ]) {
        expect(`${stdout}${stderr}`).not.toContain(forbidden);
      }
      expect(await readdir(externalCwd)).toEqual([]);
    } finally {
      await rm(externalCwd, { recursive: true, force: true });
    }
  });

  test("documents doctor and rejects unknown or extra arguments without leaks", async () => {
    const externalCwd = await mkdtemp(join(tmpdir(), "pdf-forge-doctor-help-"));
    const rawToken = "fake-help-token-raw-do-not-use";
    const env = {
      HOME: process.env.HOME ?? tmpdir(),
      PATH: process.env.PATH ?? "",
      TMPDIR: process.env.TMPDIR ?? tmpdir(),
      PDF_FORGE_DEEPSQL_AUTH_TOKEN: rawToken,
    };
    const runCli = async (args: string[]) => {
      const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
        cwd: externalCwd,
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
    };

    try {
      const rootHelp = await runCli(["--help"]);
      expect(rootHelp.exitCode).toBe(0);
      expect(rootHelp.stdout).toContain("pdf-forge doctor --json");

      for (const args of [["doctor"], ["doctor", "--help"]]) {
        const help = await runCli(args);
        expect(help.exitCode, args.join(" ")).toBe(0);
        expect(help.stderr).toBe("");
        expect(help.stdout).toContain("pdf-forge doctor --json");
      }

      const invalidCases = [
        {
          args: ["doctor", "--unknown"],
          message: 'Unknown doctor option "--unknown".',
        },
        {
          args: ["doctor", "--json", "extra"],
          message: 'Unexpected doctor argument "extra".',
        },
      ];
      for (const invalid of invalidCases) {
        const result = await runCli(invalid.args);
        expect(result.exitCode, invalid.args.join(" ")).toBe(2);
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(invalid.message);
        expect(result.stderr).toContain("Usage:");
        expect(result.stderr).toContain("pdf-forge doctor --json");
        expect(`${result.stdout}${result.stderr}`).not.toContain(rawToken);
        expect(`${result.stdout}${result.stderr}`).not.toContain(PACKAGE_ROOT);
      }
    } finally {
      await rm(externalCwd, { recursive: true, force: true });
    }
  });
});
