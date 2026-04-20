import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

let tempDir: string;
let renderedDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "gen-preview-"));
  renderedDir = join(tempDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(renderedDir, { recursive: true });
  const redPx = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAIiLUMYAAAAASUVORK5CYII=",
    "base64"
  );
  await writeFile(join(renderedDir, "01-hook.png"), redPx);
  await writeFile(join(renderedDir, "02-body.png"), redPx);
  await writeFile(
    join(renderedDir, "manifest.yaml"),
    `carousel:
  format: post-4-5
  theme: dark-editorial
  generated_at: 2026-04-20T11:30:00-03:00
  slides:
    - file: 01-hook.png
      archetype: cover
    - file: 02-body.png
      archetype: steps
`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generate-preview CLI", () => {
  test("writes preview.html listing all PNGs", async () => {
    await $`bun run scripts/generate-preview.ts ${renderedDir}`.quiet();
    const files = await readdir(renderedDir);
    expect(files).toContain("preview.html");
    const html = await readFile(join(renderedDir, "preview.html"), "utf-8");
    expect(html).toContain("01-hook.png");
    expect(html).toContain("02-body.png");
    expect(html).toContain("post-4-5");
    expect(html).toContain("dark-editorial");
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("handles directory without manifest.yaml", async () => {
    const bare = join(tempDir, "bare");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(bare, { recursive: true });
    const redPx = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAIiLUMYAAAAASUVORK5CYII=",
      "base64"
    );
    await writeFile(join(bare, "01.png"), redPx);
    await $`bun run scripts/generate-preview.ts ${bare}`.quiet();
    const html = await readFile(join(bare, "preview.html"), "utf-8");
    expect(html).toContain("01.png");
  });
});
