import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { dump as yamlDump } from "js-yaml";
import type { SocialFormat } from "./types.js";

export interface ManifestSlide {
  file: string;
  archetype: string;
  headline?: string;
  [extra: string]: unknown;
}

export interface ManifestInput {
  outputPath: string;
  format: SocialFormat;
  theme?: string;
  slides: ManifestSlide[];
  caption?: string;
  hashtags?: string[];
}

export async function writeManifest(input: ManifestInput): Promise<void> {
  // Slide `file` is a basename relative to the manifest's directory — both the
  // manifest writer and the preview generator rely on this contract.
  for (const slide of input.slides) {
    if (basename(slide.file) !== slide.file) {
      throw new Error(
        `Manifest slide.file must be a basename, got "${slide.file}". Strip directory components before calling writeManifest.`
      );
    }
  }

  const data: Record<string, unknown> = {
    carousel: {
      format: input.format,
      ...(input.theme ? { theme: input.theme } : {}),
      generated_at: new Date().toISOString(),
      slides: input.slides,
    },
  };

  if (input.caption) data.caption_suggestion = input.caption;
  if (input.hashtags && input.hashtags.length > 0)
    data.hashtag_suggestion = input.hashtags;

  const yaml = yamlDump(data, {
    lineWidth: 120,
    quotingType: '"',
    forceQuotes: false,
  });
  await writeFile(input.outputPath, yaml, "utf-8");
}
