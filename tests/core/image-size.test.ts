import { describe, test, expect } from "bun:test";
import {
  readPngSize,
  fitToLongEdge,
  pickPptxAspect,
} from "../../src/core/image-size";
import { makePng } from "../helpers/make-png";

describe("readPngSize", () => {
  test("reads intrinsic dimensions from a PNG IHDR", () => {
    expect(readPngSize(makePng(640, 360))).toEqual({ width: 640, height: 360 });
    expect(readPngSize(makePng(1080, 1350))).toEqual({
      width: 1080,
      height: 1350,
    });
    expect(readPngSize(makePng(7, 11))).toEqual({ width: 7, height: 11 });
  });

  test("throws on non-PNG input", () => {
    expect(() => readPngSize(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => readPngSize(new Uint8Array(32))).toThrow(/signature/i);
  });

  test("throws when the first chunk is not IHDR", () => {
    const bytes = new Uint8Array(32);
    // Valid PNG signature…
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    // …but a fake "tEXt" chunk type at offset 12.
    bytes.set([0, 0, 0, 13, 0x74, 0x45, 0x58, 0x74], 8);
    expect(() => readPngSize(bytes)).toThrow(/IHDR/i);
  });
});

describe("fitToLongEdge", () => {
  test("16:9 keeps the legacy 1440x810 page (backward compatible)", () => {
    // A 1920x1080 slide rendered at scale 2 is 3840x2160 px.
    expect(fitToLongEdge(3840, 2160, 1440)).toEqual({ width: 1440, height: 810 });
    expect(fitToLongEdge(1920, 1080, 1440)).toEqual({ width: 1440, height: 810 });
  });

  test("preserves aspect for non-16:9 formats (no distortion)", () => {
    // 4:5 portrait (1080x1350 @2x = 2160x2700)
    expect(fitToLongEdge(2160, 2700, 1440)).toEqual({ width: 1152, height: 1440 });
    // 1:1 square
    expect(fitToLongEdge(2160, 2160, 1440)).toEqual({ width: 1440, height: 1440 });
    // 9:16 story (1080x1920 @2x = 2160x3840)
    expect(fitToLongEdge(2160, 3840, 1440)).toEqual({ width: 810, height: 1440 });
  });

  test("computed aspect ratio matches the source", () => {
    const r = fitToLongEdge(2160, 2700, 1440);
    expect(r.width / r.height).toBeCloseTo(2160 / 2700, 5);
  });

  test("rejects non-positive dimensions", () => {
    expect(() => fitToLongEdge(0, 100)).toThrow();
    expect(() => fitToLongEdge(100, -1)).toThrow();
  });
});

describe("pickPptxAspect", () => {
  test("snaps landscape decks to named presets", () => {
    expect(pickPptxAspect(1920, 1080)).toMatchObject({
      label: "16:9",
      width: 13.333,
      height: 7.5,
    });
    expect(pickPptxAspect(1024, 768)).toMatchObject({
      label: "4:3",
      width: 10,
      height: 7.5,
    });
  });

  test("derives an aspect-preserving size for social formats", () => {
    const square = pickPptxAspect(1080, 1080);
    expect(square.width).toBeCloseTo(square.height, 3);

    const portrait = pickPptxAspect(1080, 1350); // 4:5
    expect(portrait.height).toBeGreaterThan(portrait.width);
    expect(portrait.width / portrait.height).toBeCloseTo(1080 / 1350, 3);
    expect(Math.max(portrait.width, portrait.height)).toBeCloseTo(13.333, 2);

    const story = pickPptxAspect(1080, 1920); // 9:16
    expect(story.width / story.height).toBeCloseTo(1080 / 1920, 3);
    expect(story.label).toContain("9:16");
  });

  test("rejects non-positive dimensions", () => {
    expect(() => pickPptxAspect(0, 100)).toThrow();
  });
});
