import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeManifest } from "../../src/core/manifest";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "manifest-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("writeManifest", () => {
  test("writes manifest.yaml with carousel metadata", async () => {
    const outputPath = join(tempDir, "manifest.yaml");
    await writeManifest({
      outputPath,
      format: "carousel-4-5",
      theme: "dark-editorial",
      slides: [
        { file: "01-hook.png", archetype: "cover", headline: "Test cover" },
        { file: "02-steps.png", archetype: "steps" },
      ],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("format: carousel-4-5");
    expect(content).toContain("theme: dark-editorial");
    expect(content).toContain("file: 01-hook.png");
    expect(content).toContain("archetype: cover");
    expect(content).toContain("generated_at:");
  });

  test("writes manifest without theme when omitted", async () => {
    const outputPath = join(tempDir, "no-theme.yaml");
    await writeManifest({
      outputPath,
      format: "post-1-1",
      slides: [{ file: "01.png", archetype: "quote" }],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("format: post-1-1");
    expect(content).not.toContain("theme:");
  });

  test("optional caption and hashtags included when provided", async () => {
    const outputPath = join(tempDir, "with-caption.yaml");
    await writeManifest({
      outputPath,
      format: "post-4-5",
      slides: [{ file: "01.png", archetype: "cover" }],
      caption: "Sample caption text",
      hashtags: ["#mvp", "#founder"],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("caption_suggestion:");
    expect(content).toContain("Sample caption text");
    expect(content).toMatch(/['"]#mvp['"]/);
    expect(content).toMatch(/['"]#founder['"]/);
  });
});
