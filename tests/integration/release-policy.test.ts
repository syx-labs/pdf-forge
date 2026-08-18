import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";

const ROOT = resolve(import.meta.dir, "../..");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("tag publication reuses the complete release gates before npm publish", async () => {
  const workflow: unknown = loadYaml(
    await readFile(resolve(ROOT, ".github/workflows/publish.yml"), "utf8")
  );
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
    throw new Error("Publish workflow must define jobs.");
  }
  const publish = workflow.jobs.publish;
  if (!isRecord(publish) || !Array.isArray(publish.steps)) {
    throw new Error("Publish workflow must define publish steps.");
  }
  const steps = publish.steps.filter(isRecord);
  const indexOfRun = (run: string) => steps.findIndex((step) => step.run === run);
  const installBrowser = indexOfRun("bunx playwright install chromium --with-deps");
  const lint = indexOfRun("bun run lint:anti-slop");
  const typecheck = indexOfRun("bun run typecheck");
  const fullSuite = steps.findIndex(
    (step) =>
      typeof step.run === "string" &&
      step.run.includes("git ls-files 'tests/**/*.test.ts'") &&
      step.run.includes('bun test "$test_file" --parallel=1 --timeout 60000')
  );
  const build = indexOfRun("bun run build");
  const npmPublish = indexOfRun("npm publish --access public");

  expect(installBrowser).toBeGreaterThanOrEqual(0);
  expect(lint).toBeGreaterThan(installBrowser);
  expect(typecheck).toBeGreaterThan(lint);
  expect(fullSuite).toBeGreaterThan(typecheck);
  expect(build).toBeGreaterThan(fullSuite);
  expect(npmPublish).toBeGreaterThan(build);
});

test("local generated and editor workspace files are ignored", async () => {
  const gitignore = await readFile(resolve(ROOT, ".gitignore"), "utf8");
  const lines = gitignore.split("\n");
  expect(lines).toContain("*.code-workspace");
  expect(lines).toContain(".artifacts/registry-gallery/");
});
