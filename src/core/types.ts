export type Format = "slides" | "docs" | "social";

export type SocialFormat =
  | "post-1-1"
  | "post-4-5"
  | "carousel-1-1"
  | "carousel-4-5"
  | "story";

export interface RenderOptions {
  inputDir: string;
  outputDir: string;
  format?: Format;
  socialFormat?: SocialFormat;
  scale?: number;
}

export interface RenderResult {
  files: string[];
  format: Format;
  socialFormat?: SocialFormat;
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
