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
  // Only meaningful when format is "social" (or auto-detect resolves to it).
  // Passing this together with format "slides"/"docs" raises a runtime error.
  socialFormat?: SocialFormat;
  scale?: number;
  // Opt-out of the overflow guard for single-viewport formats (slides, social).
  // Docs are always exempt — page.pdf paginates natively.
  allowOverflow?: boolean;
  // Override the screenshot viewport for the `slides` format. Defaults to
  // 1920×1080. Use for decks/posters whose pages are a different fixed size
  // (e.g. a PSD artboard that is not 16:9). Ignored for `docs`/`social`.
  viewport?: { width: number; height: number };
}

// Discriminated by `format`: the social branch narrows `socialFormat` to a
// required `SocialFormat`; slides/docs branches have `socialFormat: undefined`.
// Callers that `if (result.format === "social")` get non-optional access.
export type RenderResult =
  | { files: string[]; format: "slides"; socialFormat?: undefined }
  | { files: string[]; format: "docs"; socialFormat?: undefined }
  | { files: string[]; format: "social"; socialFormat: SocialFormat };

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
