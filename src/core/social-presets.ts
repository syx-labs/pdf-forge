import type { SocialFormat } from "./types.js";

export interface Viewport {
  width: number;
  height: number;
}

export const SOCIAL_VIEWPORTS: Record<SocialFormat, Viewport> = {
  "post-1-1": { width: 1080, height: 1080 },
  "post-4-5": { width: 1080, height: 1350 },
  "carousel-1-1": { width: 1080, height: 1080 },
  "carousel-4-5": { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};

export const SOCIAL_FORMAT_VALUES: readonly SocialFormat[] = [
  "post-1-1",
  "post-4-5",
  "carousel-1-1",
  "carousel-4-5",
  "story",
] as const;

export function getSocialViewport(format: SocialFormat): Viewport {
  const viewport = SOCIAL_VIEWPORTS[format];
  if (!viewport) {
    throw new Error(
      `Unknown social format "${format}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }
  return viewport;
}

export function isValidSocialFormat(value: unknown): value is SocialFormat {
  return (
    typeof value === "string" &&
    (SOCIAL_FORMAT_VALUES as readonly string[]).includes(value)
  );
}
