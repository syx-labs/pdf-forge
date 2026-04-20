import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Format } from "./types.js";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => join(dir, f));
}

export async function detectFormat(htmlFiles: string[]): Promise<Format> {
  if (htmlFiles.length === 0) {
    throw new Error("No HTML files found in the input directory.");
  }
  const content = await readFile(htmlFiles[0], "utf-8");
  if (parseSocialFormatAttribute(content) !== null) return "social";
  if (content.includes("w-[1920px]")) return "slides";
  if (content.includes("w-[210mm]")) return "docs";
  throw new Error(
    'Could not auto-detect format. Declare data-social-format="<preset>" on <body> for social, ' +
      "or use --format to specify. Valid formats: slides, docs, social."
  );
}

export async function detectInputFormat(dir: string): Promise<{
  format: "png" | "pdf";
  files: string[];
}> {
  const entries = await readdir(dir);
  const pngs = entries
    .filter((f) => extname(f).toLowerCase() === ".png")
    .sort();
  const pdfs = entries
    .filter((f) => extname(f).toLowerCase() === ".pdf")
    .sort();

  if (pngs.length > 0)
    return { format: "png", files: pngs.map((f) => join(dir, f)) };
  if (pdfs.length > 0)
    return { format: "pdf", files: pdfs.map((f) => join(dir, f)) };
  throw new Error("No PNG or PDF files found in the input directory.");
}

const SOCIAL_FORMAT_REGEX =
  /<body\b[^>]*\bdata-social-format\s*=\s*["']([^"']+)["']/i;

export function parseSocialFormatAttribute(html: string): string | null {
  const match = html.match(SOCIAL_FORMAT_REGEX);
  return match ? match[1] : null;
}
