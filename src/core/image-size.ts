export interface PixelSize {
  width: number;
  height: number;
}

export interface PptxSlideSize {
  /** Human label, e.g. "16:9" (snapped preset) or "auto 4:5" (derived). */
  label: string;
  /** Inches. */
  width: number;
  /** Inches. */
  height: number;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/**
 * Read a PNG's intrinsic pixel dimensions from its IHDR chunk without decoding
 * pixels. The IHDR is always the first chunk; its width/height are the first 8
 * bytes of the chunk data (byte offsets 16 and 20 from the file start).
 */
export function readPngSize(bytes: Uint8Array): PixelSize {
  if (bytes.length < 24) {
    throw new Error("Not a valid PNG: file too short to contain an IHDR.");
  }
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error("Not a valid PNG: bad signature.");
    }
  }
  // IHDR must be the first chunk: 4-byte length + 4-byte type at offsets 8..15.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunkLen = view.getUint32(8, false);
  const chunkType = String.fromCharCode(
    bytes[12]!,
    bytes[13]!,
    bytes[14]!,
    bytes[15]!
  );
  if (chunkType !== "IHDR" || chunkLen < 13) {
    throw new Error("Not a valid PNG: first chunk is not a valid IHDR.");
  }
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) {
    throw new Error("Not a valid PNG: non-positive dimensions in IHDR.");
  }
  return { width, height };
}

/**
 * Scale (width, height) so the longer edge equals `longEdge`, preserving the
 * source aspect ratio. Returns integer dimensions.
 *
 * This is the page-sizing rule for PNG→PDF merging: a 16:9 slide (3840×2160 at
 * scale 2) maps to the legacy 1440×810 page, while social formats (1:1, 4:5,
 * 9:16) keep their true aspect instead of being squashed into 16:9.
 */
export function fitToLongEdge(
  width: number,
  height: number,
  longEdge = 1440
): PixelSize {
  if (width <= 0 || height <= 0) {
    throw new Error("fitToLongEdge: dimensions must be positive.");
  }
  const scale = longEdge / Math.max(width, height);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

const PPTX_PRESETS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 13.333, height: 7.5 },
  "4:3": { width: 10, height: 7.5 },
  "16:10": { width: 13.333, height: 8.333 },
  "a4-landscape": { width: 11.69, height: 8.27 },
  "a4-portrait": { width: 8.27, height: 11.69 },
};

// Longer slide edge for derived (non-preset) aspects, in inches. Matches the
// 16:9 preset's long edge so landscape decks stay a familiar physical size.
const PPTX_LONG_EDGE_IN = 13.333;

// Snap to a named preset only when the source ratio is within this fraction of
// the preset ratio — keeps 16:9/4:3 decks on the canonical sizes while letting
// social ratios fall through to a derived, distortion-free size.
const PPTX_SNAP_TOLERANCE = 0.02;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function ratioLabel(width: number, height: number): string {
  const w = Math.round(width);
  const h = Math.round(height);
  const g = gcd(w, h) || 1;
  const rw = w / g;
  const rh = h / g;
  if (rw <= 64 && rh <= 64) return `${rw}:${rh}`;
  return `${round3(width / height)}:1`;
}

/**
 * Pick a PPTX slide size for a PNG's pixel dimensions. Snaps to a named preset
 * when the aspect matches within tolerance (16:9 decks stay 13.333×7.5), else
 * derives an aspect-preserving size with the longer edge at PPTX_LONG_EDGE_IN —
 * so square/portrait social renders are never stretched.
 */
export function pickPptxAspect(width: number, height: number): PptxSlideSize {
  if (width <= 0 || height <= 0) {
    throw new Error("pickPptxAspect: dimensions must be positive.");
  }
  const ratio = width / height;

  let best: { name: string; width: number; height: number; err: number } | null =
    null;
  for (const [name, dims] of Object.entries(PPTX_PRESETS)) {
    const presetRatio = dims.width / dims.height;
    const err = Math.abs(presetRatio - ratio) / ratio;
    if (best === null || err < best.err) {
      best = { name, width: dims.width, height: dims.height, err };
    }
  }
  if (best && best.err <= PPTX_SNAP_TOLERANCE) {
    return { label: best.name, width: best.width, height: best.height };
  }

  const label = `auto ${ratioLabel(width, height)}`;
  if (width >= height) {
    return {
      label,
      width: PPTX_LONG_EDGE_IN,
      height: round3((PPTX_LONG_EDGE_IN * height) / width),
    };
  }
  return {
    label,
    width: round3((PPTX_LONG_EDGE_IN * width) / height),
    height: PPTX_LONG_EDGE_IN,
  };
}
