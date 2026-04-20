import { describe, test, expect } from "bun:test";
import type { Format, SocialFormat, RenderOptions } from "../../src/core/types";

describe("Format type", () => {
  test("accepts slides, docs, and social", () => {
    const formats: Format[] = ["slides", "docs", "social"];
    expect(formats).toHaveLength(3);
  });
});

describe("SocialFormat type", () => {
  test("enumerates all five Instagram sub-formats", () => {
    const formats: SocialFormat[] = [
      "post-1-1",
      "post-4-5",
      "carousel-1-1",
      "carousel-4-5",
      "story",
    ];
    expect(formats).toHaveLength(5);
  });
});

describe("RenderOptions with socialFormat", () => {
  test("socialFormat is optional and typed", () => {
    const opts: RenderOptions = {
      inputDir: "/tmp/in",
      outputDir: "/tmp/out",
      format: "social",
      socialFormat: "post-4-5",
    };
    expect(opts.socialFormat).toBe("post-4-5");
  });
});
