import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { mergePages } from "../../src/core/merger";

let tempDir: string;
let inputDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-merge-test-"));
  inputDir = join(tempDir, "input");
  await mkdir(inputDir, { recursive: true });

  // Create two minimal single-page PDFs
  for (const name of ["01-page.pdf", "02-page.pdf"]) {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]); // A4 in points
    const bytes = await doc.save();
    await writeFile(join(inputDir, name), bytes);
  }
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("mergePages", () => {
  test("merges two PDFs into one", async () => {
    const outputPath = join(tempDir, "merged.pdf");
    const result = await mergePages({ inputDir, outputPath });

    expect(result.pageCount).toBe(2);
    expect(result.path).toBe(outputPath);
    expect(result.fileSize).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);

    // Verify the merged PDF has 2 pages
    const { readFile } = await import("node:fs/promises");
    const fileBytes = await readFile(outputPath);
    const doc = await PDFDocument.load(fileBytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
