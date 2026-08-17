import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";

const CONFIG_PATH = resolve(import.meta.dir, "../../oxlint.config.ts");
const CI_PATH = resolve(import.meta.dir, "../../.github/workflows/ci.yml");
const PACKAGE_PATH = resolve(import.meta.dir, "../../package.json");
const VENDOR_PATH = resolve(import.meta.dir, "../../tools/oxlint/anti-slop");

const REQUIRED_RULES = [
  "no-chained-type-assertions",
  "no-known-value-widening",
  "no-widen-then-assert",
  "no-object-parameters",
  "require-safety-comment-for-type-assertion",
] as const;

const EXPECTED_IGNORES = [
  ".claude-plugin/**",
  "assets/**",
  "skills/**",
  "tools/oxlint/anti-slop/**",
];

const LINT_BOUNDARIES = ["src", "bin", "scripts", "tests"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

test("anti-slop config denies all five rules across every code boundary", async () => {
  expect(await Bun.file(CONFIG_PATH).exists()).toBe(true);

  const { default: config } = await import("../../oxlint.config.ts");

  expect(config.jsPlugins).toContainEqual({
    name: "anti-slop",
    specifier: "./tools/oxlint/anti-slop/index.ts",
  });

  for (const rule of REQUIRED_RULES) {
    expect(config.rules?.[`anti-slop/${rule}`]).toBe("error");
  }

  expect(config.ignorePatterns).toEqual(EXPECTED_IGNORES);
  for (const boundary of LINT_BOUNDARIES) {
    expect(
      config.ignorePatterns?.some(
        (pattern) => pattern === boundary || pattern.startsWith(`${boundary}/`),
      ),
    ).toBe(false);
  }

  const packageJson: unknown = JSON.parse(await readFile(PACKAGE_PATH, "utf8"));
  if (!isRecord(packageJson) || !isRecord(packageJson.scripts)) {
    throw new Error("package.json must define scripts");
  }
  expect(packageJson.scripts["lint:anti-slop"]).toBe(
    "oxlint -c oxlint.config.ts --deny-warnings src bin scripts tests",
  );
  if (!isRecord(packageJson.devDependencies)) {
    throw new Error("package.json must define devDependencies");
  }
  expect(packageJson.devDependencies.oxlint).toBe("1.78.0");
  expect(packageJson.devDependencies["@oxlint/plugins"]).toBe("1.78.0");
});

test("check job runs anti-slop after install and before typecheck without duplicating it", async () => {
  const ci: unknown = loadYaml(await readFile(CI_PATH, "utf8"));
  if (!isRecord(ci) || !isRecord(ci.jobs)) throw new Error("CI must define jobs");

  const checkJob = ci.jobs.check;
  const integrationJob = ci.jobs.integration;
  if (!isRecord(checkJob) || !Array.isArray(checkJob.steps)) {
    throw new Error("CI check job must define steps");
  }
  if (!isRecord(integrationJob) || !Array.isArray(integrationJob.steps)) {
    throw new Error("CI integration job must define steps");
  }

  const installIndex = checkJob.steps.findIndex(
    (step) => isRecord(step) && step.run === "bun install",
  );
  const antiSlopIndex = checkJob.steps.findIndex(
    (step) =>
      isRecord(step) &&
      step.name === "Anti-slop lint" &&
      step.run === "bun run lint:anti-slop",
  );
  const typecheckIndex = checkJob.steps.findIndex(
    (step) => isRecord(step) && step.name === "Type check",
  );

  expect(installIndex).toBeGreaterThanOrEqual(0);
  expect(antiSlopIndex).toBeGreaterThan(installIndex);
  expect(typecheckIndex).toBeGreaterThan(antiSlopIndex);
  expect(
    integrationJob.steps.some(
      (step) => isRecord(step) && step.run === "bun run lint:anti-slop",
    ),
  ).toBe(false);
});

test("vendored rules retain pinned MIT provenance", async () => {
  const provenance = await readFile(resolve(VENDOR_PATH, "UPSTREAM.md"), "utf8");
  const license = await readFile(resolve(VENDOR_PATH, "LICENSE"), "utf8");

  expect(provenance).toContain("https://github.com/dmmulroy/anti-slop");
  expect(provenance).toContain("446268e5d15baa968eaec669ff65358d36ae6259");
  expect(license).toContain("MIT License");
  expect(license).toContain("Copyright (c) 2026 Dillon Mulroy");
});
