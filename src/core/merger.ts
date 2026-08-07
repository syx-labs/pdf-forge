import { stat as fsStat, readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { MergeOptions, MergeResult } from "./types.js";
import { detectInputFormat, formatFileSize } from "./utils.js";
import { fitToLongEdge } from "./image-size.js";

// Each PNG page is sized to its own intrinsic aspect ratio, normalized so the
// longer edge is PNG_LONG_EDGE points. A 16:9 slide lands on the legacy
// 1440×810 page; social formats (1:1, 4:5, 9:16) keep their true shape instead
// of being squashed into 16:9. Mixed-aspect inputs each get a correct page.
const PNG_LONG_EDGE = 1440;

async function mergePngs(
  files: string[],
  outputPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  for (const filePath of files) {
    const imageBytes = await readFile(filePath);
    const pngImage = await pdfDoc.embedPng(imageBytes);
    const { width, height } = fitToLongEdge(
      pngImage.width,
      pngImage.height,
      PNG_LONG_EDGE
    );
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pngImage, { x: 0, y: 0, width, height });
  }
  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, pdfBytes);
}

async function mergePdfs(
  files: string[],
  outputPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  for (const filePath of files) {
    const bytes = await readFile(filePath);
    const srcDoc = await PDFDocument.load(bytes);
    const copiedPages = await pdfDoc.copyPages(
      srcDoc,
      srcDoc.getPageIndices()
    );
    for (const page of copiedPages) {
      pdfDoc.addPage(page);
    }
  }
  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, pdfBytes);
}

export async function mergePages(
  options: MergeOptions
): Promise<MergeResult> {
  const { inputDir, outputPath } = options;
  const s = await fsStat(inputDir);
  if (!s.isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  const { format, files } = await detectInputFormat(inputDir);
  if (format === "png") {
    await mergePngs(files, outputPath);
  } else {
    await mergePdfs(files, outputPath);
  }

  const outputStat = await fsStat(outputPath);
  return {
    path: outputPath,
    pageCount: files.length,
    fileSize: formatFileSize(outputStat.size),
  };
}
