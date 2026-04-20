import { describe, test, expect } from "bun:test";
import {
  SOCIAL_VIEWPORTS,
  getSocialViewport,
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "../../src/core/social-presets";

describe("SOCIAL_VIEWPORTS", () => {
  test("post-1-1 is 1080x1080", () => {
    expect(SOCIAL_VIEWPORTS["post-1-1"]).toEqual({ width: 1080, height: 1080 });
  });

  test("post-4-5 is 1080x1350", () => {
    expect(SOCIAL_VIEWPORTS["post-4-5"]).toEqual({ width: 1080, height: 1350 });
  });

  test("carousel-1-1 matches post-1-1", () => {
    expect(SOCIAL_VIEWPORTS["carousel-1-1"]).toEqual({ width: 1080, height: 1080 });
  });

  test("carousel-4-5 matches post-4-5", () => {
    expect(SOCIAL_VIEWPORTS["carousel-4-5"]).toEqual({ width: 1080, height: 1350 });
  });

  test("story is 1080x1920", () => {
    expect(SOCIAL_VIEWPORTS["story"]).toEqual({ width: 1080, height: 1920 });
  });
});

describe("getSocialViewport", () => {
  test("returns viewport for valid format", () => {
    expect(getSocialViewport("story")).toEqual({ width: 1080, height: 1920 });
  });

  test("throws on invalid format", () => {
    expect(() => getSocialViewport("post-16-9" as never)).toThrow(
      /Unknown social format/
    );
  });
});

describe("isValidSocialFormat", () => {
  test("accepts all five valid values", () => {
    for (const fmt of SOCIAL_FORMAT_VALUES) {
      expect(isValidSocialFormat(fmt)).toBe(true);
    }
  });

  test("rejects invalid strings", () => {
    expect(isValidSocialFormat("post-16-9")).toBe(false);
    expect(isValidSocialFormat("")).toBe(false);
    expect(isValidSocialFormat(null)).toBe(false);
  });
});

describe("SOCIAL_FORMAT_VALUES", () => {
  test("contains all five formats in stable order", () => {
    expect(SOCIAL_FORMAT_VALUES).toEqual([
      "post-1-1",
      "post-4-5",
      "carousel-1-1",
      "carousel-4-5",
      "story",
    ]);
  });
});
