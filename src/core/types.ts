export type Format = "slides" | "docs";

export interface RenderOptions {
  inputDir: string;
  outputDir: string;
  format?: Format;
  scale?: number;
}

export interface RenderResult {
  files: string[];
  format: Format;
}

export interface MergeOptions {
  inputDir: string;
  outputPath: string;
}

export interface MergeResult {
  path: string;
  pageCount: number;
  fileSize: string;
}

export interface SetupOptions {
  pluginRoot: string;
}
