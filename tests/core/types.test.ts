import { describe, test, expect } from "bun:test";
import type { Format, SocialFormat, RenderOptions, RenderResult } from "../../src/core/types";
import { FORMAT_VALUES, isValidFormat } from "../../src/core/social-presets";

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

describe("FORMAT_VALUES + isValidFormat", () => {
  test("FORMAT_VALUES enumerates all three formats", () => {
    expect(FORMAT_VALUES).toEqual(["slides", "docs", "social"]);
  });

  test("isValidFormat accepts known formats", () => {
    expect(isValidFormat("slides")).toBe(true);
    expect(isValidFormat("docs")).toBe(true);
    expect(isValidFormat("social")).toBe(true);
  });

  test("isValidFormat rejects unknown strings", () => {
    expect(isValidFormat("Slides")).toBe(false);
    expect(isValidFormat("")).toBe(false);
    expect(isValidFormat("pdf")).toBe(false);
    expect(isValidFormat(undefined)).toBe(false);
    expect(isValidFormat(42)).toBe(false);
  });
});

describe("RenderResult discriminated union", () => {
  test("social variant narrows socialFormat to required", () => {
    const r: RenderResult = {
      files: ["out.png"],
      format: "social",
      socialFormat: "story",
    };
    if (r.format === "social") {
      // Type-level assertion: no optional chaining needed inside this branch.
      const fmt: SocialFormat = r.socialFormat;
      expect(fmt).toBe("story");
    }
  });

  test("slides variant has no socialFormat at runtime", () => {
    const r: RenderResult = { files: ["a.png"], format: "slides", socialFormat: undefined };
    expect(r.format).toBe("slides");
    expect(r.socialFormat).toBeUndefined();
  });
});
