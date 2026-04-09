import { stat as fsStat, readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import type { MergeOptions, MergeResult } from "./types.js";
import { detectInputFormat, formatFileSize } from "./utils.js";

const SLIDE_WIDTH = 1440;
const SLIDE_HEIGHT = 810;

async function mergePngs(
  files: string[],
  outputPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  for (const filePath of files) {
    const imageBytes = await readFile(filePath);
    const pngImage = await pdfDoc.embedPng(imageBytes);
    const page = pdfDoc.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    });
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
