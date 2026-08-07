#!/usr/bin/env bun
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PDFDocument } from "pdf-lib";

const args = process.argv.slice(2);
const inputDir = resolve(args[0] ?? "./rendered/");
let outputPath = resolve("./output.pdf");

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) {
    outputPath = resolve(args[++i]);
  }
}

const files = (await readdir(inputDir))
  .filter((f) => f.endsWith(".pdf"))
  .sort();

if (files.length === 0) {
  console.error(`No PDF files found in ${inputDir}`);
  process.exit(1);
}

const merged = await PDFDocument.create();

for (const file of files) {
  const bytes = await readFile(join(inputDir, file));
  const doc = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(doc, doc.getPageIndices());
  pages.forEach((p) => merged.addPage(p));
}

const outBytes = await merged.save();
await writeFile(outputPath, outBytes);
console.log(`Merged ${files.length} pages → ${outputPath}`);
