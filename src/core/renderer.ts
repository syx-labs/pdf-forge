import { mkdir, stat as fsStat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Format, RenderOptions, RenderResult, SocialFormat } from "./types.js";
import { getHtmlFiles, detectFormat, parseSocialFormatAttribute } from "./utils.js";
import {
  getSocialViewport,
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "./social-presets.js";

async function resolveSocialFormat(
  htmlFiles: string[],
  override?: SocialFormat
): Promise<SocialFormat> {
  if (override) {
    if (!isValidSocialFormat(override)) {
      throw new Error(
        `Invalid socialFormat "${override}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
    }
    return override;
  }

  const contents = await Promise.all(
    htmlFiles.map((f) => readFile(f, "utf-8"))
  );
  const declared = contents.map(parseSocialFormatAttribute);
  const firstDeclared = declared.find((d) => d !== null);

  if (!firstDeclared) {
    throw new Error(
      'No data-social-format found on any slide. Add data-social-format="<preset>" to <body>, ' +
        `or pass socialFormat option. Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }

  if (!isValidSocialFormat(firstDeclared)) {
    throw new Error(
      `Invalid data-social-format="${firstDeclared}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }

  for (const [i, decl] of declared.entries()) {
    if (decl !== null && decl !== firstDeclared) {
      throw new Error(
        `Carousel has mixed social formats: "${firstDeclared}" in "${basename(
          htmlFiles[0]
        )}" vs "${decl}" in "${basename(htmlFiles[i])}". All slides must share the same data-social-format.`
      );
    }
  }

  return firstDeclared;
}

export async function renderPages(options: RenderOptions): Promise<RenderResult> {
  const { inputDir, outputDir, scale = 2 } = options;

  // Guard: socialFormat only applies to the social format. Silently ignoring
  // it for slides/docs would mask user misconfiguration.
  if (
    options.socialFormat !== undefined &&
    (options.format === "slides" || options.format === "docs")
  ) {
    throw new Error(
      `socialFormat "${options.socialFormat}" is incompatible with format "${options.format}". ` +
        `Omit socialFormat or set format to "social".`
    );
  }

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

  let socialFormat: SocialFormat | undefined;
  let viewport: { width: number; height: number };

  if (format === "slides") {
    viewport = { width: 1920, height: 1080 };
  } else if (format === "docs") {
    viewport = { width: 794, height: 1123 };
  } else {
    socialFormat = await resolveSocialFormat(htmlFiles, options.socialFormat);
    viewport = getSocialViewport(socialFormat);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
  });

  const outputFiles: string[] = [];

  try {
    for (const filePath of htmlFiles) {
      const name = basename(filePath);
      const page = await context.newPage();

      await page.goto(`file://${filePath}`, { waitUntil: "load" });

      await page.waitForFunction(
        () => {
          const styles = document.querySelectorAll("style");
          return Array.from(styles).some((s) =>
            s.textContent?.includes("--tw-")
          );
        },
        { timeout: 10_000 }
      );

      await page.evaluate(() => document.fonts.ready);

      if (format === "social") {
        const overflow = await page.evaluate(
          (h) => {
            return {
              scrollHeight: document.documentElement.scrollHeight,
              viewportHeight: h,
            };
          },
          viewport.height
        );
        // +2px tolerance for sub-pixel layout rounding (Chromium rasterizes
        // fractional heights that round up — tightening to `>` causes flaky failures).
        if (overflow.scrollHeight > overflow.viewportHeight + 2) {
          throw new Error(
            `Content overflow in "${name}": body scrollHeight ${overflow.scrollHeight}px > viewport ${overflow.viewportHeight}px. ` +
              `Reduce content, shorten text, or lower font sizes.`
          );
        }
      }

      if (format === "docs") {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".pdf"));
        await page.pdf({
          path: outputPath,
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        outputFiles.push(outputPath);
      } else {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".png"));
        await page.screenshot({
          path: outputPath,
          fullPage: true,
          type: "png",
        });
        outputFiles.push(outputPath);
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  if (format === "social") {
    // socialFormat is guaranteed set above when format === "social".
    if (socialFormat === undefined) {
      throw new Error("Internal: socialFormat unresolved for format=social.");
    }
    return { files: outputFiles, format, socialFormat };
  }
  return { files: outputFiles, format, socialFormat: undefined };
}
