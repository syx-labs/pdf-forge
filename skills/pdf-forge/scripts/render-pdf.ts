#!/usr/bin/env bun
import { chromium } from "playwright";
import { readdir, mkdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";

const args = process.argv.slice(2);
const inputDir = resolve(args[0] ?? "./pages/");
let outputDir = "./output/";
let format: "slides" | "docs" = "docs";
let scale = 2;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--output" && args[i + 1]) {
    outputDir = args[++i];
  } else if (args[i] === "--format" && args[i + 1]) {
    format = args[++i] as "slides" | "docs";
  } else if (args[i] === "--scale" && args[i + 1]) {
    scale = Number(args[++i]);
  }
}

outputDir = resolve(outputDir);
await mkdir(outputDir, { recursive: true });

const files = (await readdir(inputDir))
  .filter((f) => f.endsWith(".html"))
  .sort();

if (files.length === 0) {
  console.error(`No HTML files found in ${inputDir}`);
  process.exit(1);
}

// Auto-detect docs from content
const sample = await Bun.file(join(inputDir, files[0])).text();
if (sample.includes("210mm") || sample.includes("297mm")) {
  format = "docs";
}

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: scale,
});

for (const file of files) {
  const filePath = join(inputDir, file);
  const outName = basename(file, ".html") + ".pdf";
  const outPath = join(outputDir, outName);

  const page = await context.newPage();

  if (format === "docs") {
    await page.setViewportSize({ width: 794, height: 1123 });
  } else {
    await page.setViewportSize({ width: 1920, height: 1080 });
  }

  await page.goto(`file://${filePath}`, { waitUntil: "networkidle" });

  await page.waitForFunction(() => {
    const styles = document.querySelectorAll("style");
    return Array.from(styles).some((s) => s.textContent?.includes("--tw-"));
  });

  await page.waitForFunction(() => document.fonts.ready.then(() => true));

  if (format === "docs") {
    await page.pdf({
      path: outPath,
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } else {
    const pngPath = join(outputDir, basename(file, ".html") + ".png");
    await page.screenshot({ path: pngPath, fullPage: true });
  }

  await page.close();
  console.log(`Rendered: ${outPath}`);
}

await browser.close();
console.log(`Done. ${files.length} page(s) rendered to ${outputDir}`);
