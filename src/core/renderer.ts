import { mkdir, stat as fsStat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Format, RenderOptions, RenderResult } from "./types.js";
import { getHtmlFiles, detectFormat } from "./utils.js";

export async function renderPages(options: RenderOptions): Promise<RenderResult> {
  const { inputDir, outputDir, scale = 2 } = options;

  const s = await fsStat(inputDir);
  if (!s.isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  const htmlFiles = await getHtmlFiles(inputDir);
  if (htmlFiles.length === 0) {
    throw new Error("No .html files found in the input directory.");
  }

  const format: Format = options.format ?? (await detectFormat(htmlFiles));
  await mkdir(outputDir, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport:
      format === "slides"
        ? { width: 1920, height: 1080 }
        : { width: 794, height: 1123 },
    deviceScaleFactor: scale,
  });

  const outputFiles: string[] = [];

  try {
    for (const filePath of htmlFiles) {
      const name = basename(filePath);
      const page = await context.newPage();

      await page.goto(`file://${filePath}`, { waitUntil: "load" });

      // Wait for Tailwind CDN to inject styles
      await page.waitForFunction(
        () => {
          const styles = document.querySelectorAll("style");
          return Array.from(styles).some((s) =>
            s.textContent?.includes("--tw-")
          );
        },
        { timeout: 10_000 }
      );

      // Wait for fonts to load
      await page.evaluate(() => document.fonts.ready);

      if (format === "slides") {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".png"));
        await page.screenshot({
          path: outputPath,
          fullPage: true,
          type: "png",
        });
        outputFiles.push(outputPath);
      } else {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".pdf"));
        await page.pdf({
          path: outputPath,
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        outputFiles.push(outputPath);
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return { files: outputFiles, format };
}
