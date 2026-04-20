import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { formatFileSize, parseSocialFormatAttribute, detectFormat } from "../../src/core/utils";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("formatFileSize", () => {
  test("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  test("formats megabytes", () => {
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});

describe("parseSocialFormatAttribute", () => {
  test("extracts value from body tag", () => {
    const html = `<html><body data-social-format="post-4-5"><div>x</div></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("post-4-5");
  });

  test("extracts with single quotes", () => {
    const html = `<html><body data-social-format='story'></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("story");
  });

  test("extracts from body with other attributes", () => {
    const html = `<html><body class="m-0" data-social-format="carousel-1-1" data-x="y"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("carousel-1-1");
  });

  test("returns null when attribute absent", () => {
    const html = `<html><body class="m-0"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBeNull();
  });

  test("returns null for empty string input", () => {
    expect(parseSocialFormatAttribute("")).toBeNull();
  });

  test("returns raw value even when invalid — caller validates", () => {
    const html = `<html><body data-social-format="invalid-x"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("invalid-x");
  });
});

describe("detectFormat social", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "detect-fmt-"));
    await writeFile(
      join(tempDir, "a.html"),
      `<html><body data-social-format="post-4-5"><div>x</div></body></html>`
    );
    await writeFile(
      join(tempDir, "b.html"),
      `<html><body><div class="w-[1920px]">slides</div></body></html>`
    );
    await writeFile(
      join(tempDir, "c.html"),
      `<html><body><div class="w-[210mm]">docs</div></body></html>`
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("detects social when data-social-format present", async () => {
    expect(await detectFormat([join(tempDir, "a.html")])).toBe("social");
  });

  test("still detects slides via w-[1920px]", async () => {
    expect(await detectFormat([join(tempDir, "b.html")])).toBe("slides");
  });

  test("still detects docs via w-[210mm]", async () => {
    expect(await detectFormat([join(tempDir, "c.html")])).toBe("docs");
  });
});
