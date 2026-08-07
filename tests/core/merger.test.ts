import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { mergePages } from "../../src/core/merger";
import { makePng } from "../helpers/make-png";

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
    const fileBytes = await readFile(outputPath);
    const doc = await PDFDocument.load(fileBytes);
    expect(doc.getPageCount()).toBe(2);
  });
});

describe("mergePages — PNG aspect preservation", () => {
  test("16:9 slide PNGs keep the legacy 1440x810 page", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-forge-png-169-"));
    await writeFile(join(dir, "01.png"), makePng(1920, 1080));
    await writeFile(join(dir, "02.png"), makePng(1920, 1080));

    const out = join(dir, "deck.pdf");
    const result = await mergePages({ inputDir: dir, outputPath: out });
    expect(result.pageCount).toBe(2);

    const doc = await PDFDocument.load(await readFile(out));
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBe(1440);
      expect(height).toBe(810);
    }
    await rm(dir, { recursive: true, force: true });
  });

  test("non-16:9 social PNGs are NOT squashed into 16:9", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-forge-png-social-"));
    await writeFile(join(dir, "01.png"), makePng(1080, 1350)); // 4:5
    await writeFile(join(dir, "02.png"), makePng(1080, 1920)); // 9:16

    const out = join(dir, "carousel.pdf");
    await mergePages({ inputDir: dir, outputPath: out });

    const doc = await PDFDocument.load(await readFile(out));
    const [p1, p2] = doc.getPages();
    // 4:5 portrait — width < height, ratio preserved (regression: was 1440x810).
    expect(p1.getWidth() / p1.getHeight()).toBeCloseTo(1080 / 1350, 2);
    expect(p1.getWidth()).toBeLessThan(p1.getHeight());
    // 9:16 story.
    expect(p2.getWidth() / p2.getHeight()).toBeCloseTo(1080 / 1920, 2);
    await rm(dir, { recursive: true, force: true });
  });
});
