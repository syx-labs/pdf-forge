import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

let tempDir: string;
let renderedDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "gen-manifest-"));
  renderedDir = join(tempDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(renderedDir, { recursive: true });
  await writeFile(join(renderedDir, "01-hook.png"), "fake");
  await writeFile(join(renderedDir, "02-body.png"), "fake");
  await writeFile(join(renderedDir, "03-cta.png"), "fake");
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generate-manifest CLI", () => {
  test("creates manifest.yaml listing all PNGs", async () => {
    await $`bun run scripts/generate-manifest.ts ${renderedDir} --format post-4-5 --archetype cover,body,cta`.quiet();
    const files = await readdir(renderedDir);
    expect(files).toContain("manifest.yaml");
    const content = await readFile(join(renderedDir, "manifest.yaml"), "utf-8");
    expect(content).toContain("file: 01-hook.png");
    expect(content).toContain("file: 02-body.png");
    expect(content).toContain("file: 03-cta.png");
    expect(content).toContain("archetype: cover");
    expect(content).toContain("archetype: body");
    expect(content).toContain("archetype: cta");
  });

  test("fails when --format missing", async () => {
    const result = await $`bun run scripts/generate-manifest.ts ${renderedDir}`
      .nothrow()
      .quiet();
    expect(result.exitCode).not.toBe(0);
  });
});
