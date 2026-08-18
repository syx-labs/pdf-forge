import type { Format, SocialFormat } from "./types.js";

export const FORMAT_VALUES = ["slides", "docs", "social"] as const satisfies readonly Format[];

export function isValidFormat(value: unknown): value is Format {
  return (
    typeof value === "string" &&
    FORMAT_VALUES.some((candidate) => candidate === value)
  );
}

export interface Viewport {
  width: number;
  height: number;
}

export const SOCIAL_VIEWPORTS = {
  "post-1-1": { width: 1080, height: 1080 },
  "post-4-5": { width: 1080, height: 1350 },
  "carousel-1-1": { width: 1080, height: 1080 },
  "carousel-4-5": { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
} satisfies Record<SocialFormat, Viewport>;

export const SOCIAL_FORMAT_VALUES = [
  "post-1-1",
  "post-4-5",
  "carousel-1-1",
  "carousel-4-5",
  "story",
] as const satisfies readonly SocialFormat[];

export function getSocialViewport(format: unknown): Viewport {
  if (!isValidSocialFormat(format)) {
    throw new Error(
      `Unknown social format "${String(format)}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }
  const viewport = SOCIAL_VIEWPORTS[format];
  return viewport;
}

export function isValidSocialFormat(value: unknown): value is SocialFormat {
  return (
    typeof value === "string" &&
    SOCIAL_FORMAT_VALUES.some((candidate) => candidate === value)
  );
}
