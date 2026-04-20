# pdf-forge Instagram Extension — Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `social` format to pdf-forge that renders Instagram posts and carousels in five aspect ratios, plus a reference cover archetype, theme presets, manifest output, and preview generator.

**Architecture:** Extend the existing `Format` union type, add a viewport preset lookup, branch the Playwright renderer when `format === "social"` to use the right viewport per `data-social-format` attribute. Templates live under `assets/templates/social/<archetype>/<format>.html`. Theme presets live under `assets/themes/` as YAML references Claude reads when composing HTML. A new `scripts/generate-preview.ts` creates an opt-in HTML grid for visual QA. SKILL.md gains a Social workflow section documenting the format, reference mode, and carousel sequence conventions.

**Tech Stack:** TypeScript (strict), Bun runtime, Playwright, Tailwind CDN, `pdf-lib` (unchanged), `js-yaml` for YAML parsing (new dependency).

**Scope:** MVP infrastructure + cover archetype as reference implementation. Remaining 9 archetypes (mega-stat, steps, quote, before-after, definition, checklist, cta, photo-overlay, bento) × 5 formats each are a follow-up plan — see `2026-04-20-pdf-forge-instagram-archetype-library.md` (to be written after this plan lands).

**Source spec:** `/Users/shadow/Projects/personal/creative-workflow/docs/superpowers/specs/2026-04-20-pdf-forge-instagram-design.md`

**Repository:** `/Users/shadow/Projects/personal/skills/pdf-forge` (branch `main`). All paths below are relative to this directory unless noted.

---

## Prerequisites

- [ ] **Confirm working directory and branch**

```bash
cd /Users/shadow/Projects/personal/skills/pdf-forge
git status
git branch --show-current
```

Expected: clean working tree on `main`. If dirty, stash or commit before proceeding.

- [ ] **Create feature branch**

```bash
git checkout -b feat/social-format
```

Expected: switched to new branch.

- [ ] **Install js-yaml dependency**

```bash
bun add js-yaml
bun add -d @types/js-yaml
```

Expected: `package.json` updated, `bun.lock` updated.

- [ ] **Commit dependency bump**

```bash
git add package.json bun.lock
git commit -m "chore: add js-yaml for theme preset loading"
```

---

## Phase 1 — Core types and viewport presets

### Task 1: Extend `Format` type and add `SocialFormat`

**Files:**
- Modify: `src/core/types.ts`
- Test: `tests/core/types.test.ts` (new file)

- [ ] **Step 1: Write the failing test**

Create `tests/core/types.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/types.test.ts
```

Expected: compile error — `social`, `SocialFormat`, and `socialFormat` not assignable / not exported.

- [ ] **Step 3: Update `src/core/types.ts`**

Replace the full content of `src/core/types.ts` with:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/core/types.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/types.ts tests/core/types.test.ts
git commit -m "feat(types): add social format and SocialFormat union"
```

---

### Task 2: Create viewport preset lookup

**Files:**
- Create: `src/core/social-presets.ts`
- Test: `tests/core/social-presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/social-presets.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/social-presets.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Create `src/core/social-presets.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/core/social-presets.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/social-presets.ts tests/core/social-presets.test.ts
git commit -m "feat(renderer): viewport presets for Instagram sub-formats"
```

---

### Task 3: Parse `data-social-format` from HTML

**Files:**
- Modify: `src/core/utils.ts`
- Modify: `tests/core/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/utils.test.ts`:

```typescript
import { parseSocialFormatAttribute } from "../../src/core/utils";

describe("parseSocialFormatAttribute", () => {
  test("extracts value from body tag", () => {
    const html = `<html><body data-social-format="post-4-5"><div>x</div></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("post-4-5");
  });

  test("extracts with single quotes", () => {
    const html = `<html><body data-social-format='story'></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("story");
  });

  test("extracts from body with other attributes", () => {
    const html = `<html><body class="m-0" data-social-format="carousel-1-1" data-x="y"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("carousel-1-1");
  });

  test("returns null when attribute absent", () => {
    const html = `<html><body class="m-0"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBeNull();
  });

  test("returns null for empty string input", () => {
    expect(parseSocialFormatAttribute("")).toBeNull();
  });

  test("returns raw value even when invalid — caller validates", () => {
    const html = `<html><body data-social-format="invalid-x"></body></html>`;
    expect(parseSocialFormatAttribute(html)).toBe("invalid-x");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/utils.test.ts
```

Expected: `parseSocialFormatAttribute` is not exported.

- [ ] **Step 3: Update `src/core/utils.ts`**

Append at the bottom:

```typescript
const SOCIAL_FORMAT_REGEX =
  /<body\b[^>]*\bdata-social-format\s*=\s*["']([^"']+)["']/i;

export function parseSocialFormatAttribute(html: string): string | null {
  const match = html.match(SOCIAL_FORMAT_REGEX);
  return match ? match[1] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/core/utils.test.ts
```

Expected: all tests pass (existing formatFileSize tests + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/core/utils.ts tests/core/utils.test.ts
git commit -m "feat(utils): parse data-social-format attribute from HTML"
```

---

### Task 4: Extend `detectFormat` to recognize social

**Files:**
- Modify: `src/core/utils.ts:19-29`
- Modify: `tests/core/utils.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/utils.test.ts`:

```typescript
import { detectFormat } from "../../src/core/utils";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("detectFormat social", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "detect-fmt-"));
    await writeFile(
      join(tempDir, "a.html"),
      `<html><body data-social-format="post-4-5"><div>x</div></body></html>`
    );
    await writeFile(
      join(tempDir, "b.html"),
      `<html><body><div class="w-[1920px]">slides</div></body></html>`
    );
    await writeFile(
      join(tempDir, "c.html"),
      `<html><body><div class="w-[210mm]">docs</div></body></html>`
    );
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("detects social when data-social-format present", async () => {
    expect(await detectFormat([join(tempDir, "a.html")])).toBe("social");
  });

  test("still detects slides via w-[1920px]", async () => {
    expect(await detectFormat([join(tempDir, "b.html")])).toBe("slides");
  });

  test("still detects docs via w-[210mm]", async () => {
    expect(await detectFormat([join(tempDir, "c.html")])).toBe("docs");
  });
});
```

Add the missing imports at the top:

```typescript
import { beforeAll, afterAll } from "bun:test";
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/utils.test.ts
```

Expected: "social" case fails — `detectFormat` currently throws because `data-social-format` isn't matched.

- [ ] **Step 3: Update `src/core/utils.ts`**

Replace the `detectFormat` function (lines 19-29 originally) with:

```typescript
export async function detectFormat(htmlFiles: string[]): Promise<Format> {
  if (htmlFiles.length === 0) {
    throw new Error("No HTML files found in the input directory.");
  }
  const content = await readFile(htmlFiles[0], "utf-8");
  if (parseSocialFormatAttribute(content) !== null) return "social";
  if (content.includes("w-[1920px]")) return "slides";
  if (content.includes("w-[210mm]")) return "docs";
  throw new Error(
    'Could not auto-detect format. Declare data-social-format="<preset>" on <body> for social, ' +
      "or use --format to specify. Valid formats: slides, docs, social."
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/core/utils.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/utils.ts tests/core/utils.test.ts
git commit -m "feat(utils): detect social format via data-social-format attribute"
```

---

## Phase 2 — Renderer social branch

### Task 5: Social format validation and viewport selection in renderer

**Files:**
- Modify: `src/core/renderer.ts`
- Create: `tests/core/renderer-social.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/renderer-social.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPages } from "../../src/core/renderer";

const makeSocialHtml = (format: string, body: string) => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head><body data-social-format="${format}" class="m-0 p-0 bg-zinc-950 text-white">
${body}
</body></html>`;

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "render-social-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("renderPages social format", () => {
  test("renders post-1-1 HTML at 1080x1080 as PNG", async () => {
    const input = join(tempDir, "post-1-1");
    const output = join(tempDir, "out-post-1-1");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      makeSocialHtml(
        "post-1-1",
        `<div class="w-screen h-screen flex items-center justify-center"><h1 class="text-6xl">Test</h1></div>`
      )
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "social",
      scale: 1,
    });
    expect(result.format).toBe("social");
    expect(result.socialFormat).toBe("post-1-1");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEndWith("01.png");
    const s = await stat(result.files[0]);
    expect(s.size).toBeGreaterThan(0);
  }, 30_000);

  test("renders story HTML at 1080x1920 as PNG", async () => {
    const input = join(tempDir, "story");
    const output = join(tempDir, "out-story");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      makeSocialHtml(
        "story",
        `<div class="w-screen h-screen flex items-center justify-center"><h1 class="text-6xl">Vertical</h1></div>`
      )
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "social",
      scale: 1,
    });
    expect(result.socialFormat).toBe("story");
    expect(result.files).toHaveLength(1);
  }, 30_000);

  test("uses options.socialFormat override when HTML lacks attribute", async () => {
    const input = join(tempDir, "override");
    const output = join(tempDir, "out-override");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
       <body class="m-0 p-0 bg-zinc-950 text-white"><div class="w-screen h-screen">ovr</div></body></html>`
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "social",
      socialFormat: "post-4-5",
      scale: 1,
    });
    expect(result.socialFormat).toBe("post-4-5");
    expect(result.files).toHaveLength(1);
  }, 30_000);

  test("throws when format=social and no socialFormat can be determined", async () => {
    const input = join(tempDir, "missing");
    const output = join(tempDir, "out-missing");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      `<!DOCTYPE html><html><body class="m-0"><div>no marker</div></body></html>`
    );
    await expect(
      renderPages({
        inputDir: input,
        outputDir: output,
        format: "social",
        scale: 1,
      })
    ).rejects.toThrow(/data-social-format/);
  }, 30_000);

  test("throws when carousel slides have mixed social formats", async () => {
    const input = join(tempDir, "mixed");
    const output = join(tempDir, "out-mixed");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      makeSocialHtml("post-1-1", `<div class="w-screen h-screen">a</div>`)
    );
    await writeFile(
      join(input, "02.html"),
      makeSocialHtml("post-4-5", `<div class="w-screen h-screen">b</div>`)
    );
    await expect(
      renderPages({
        inputDir: input,
        outputDir: output,
        format: "social",
        scale: 1,
      })
    ).rejects.toThrow(/mixed.*social.*format/i);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/renderer-social.test.ts
```

Expected: failures — renderer doesn't know `social` branch yet.

- [ ] **Step 3: Update `src/core/renderer.ts`**

Replace the full file content with:

```typescript
import { mkdir, stat as fsStat, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Format, RenderOptions, RenderResult, SocialFormat } from "./types.js";
import { getHtmlFiles, detectFormat, parseSocialFormatAttribute } from "./utils.js";
import {
  getSocialViewport,
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "./social-presets.js";

async function resolveSocialFormat(
  htmlFiles: string[],
  override?: SocialFormat
): Promise<SocialFormat> {
  if (override) {
    if (!isValidSocialFormat(override)) {
      throw new Error(
        `Invalid socialFormat "${override}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
    }
    return override;
  }

  const contents = await Promise.all(
    htmlFiles.map((f) => readFile(f, "utf-8"))
  );
  const declared = contents.map(parseSocialFormatAttribute);
  const firstDeclared = declared.find((d) => d !== null);

  if (!firstDeclared) {
    throw new Error(
      'No data-social-format found on any slide. Add data-social-format="<preset>" to <body>, ' +
        `or pass socialFormat option. Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }

  if (!isValidSocialFormat(firstDeclared)) {
    throw new Error(
      `Invalid data-social-format="${firstDeclared}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
    );
  }

  for (const [i, decl] of declared.entries()) {
    if (decl !== null && decl !== firstDeclared) {
      throw new Error(
        `Carousel has mixed social formats: "${firstDeclared}" in "${basename(
          htmlFiles[0]
        )}" vs "${decl}" in "${basename(htmlFiles[i])}". All slides must share the same data-social-format.`
      );
    }
  }

  return firstDeclared;
}

export async function renderPages(options: RenderOptions): Promise<RenderResult> {
  const { inputDir, outputDir, scale = 2 } = options;

  const s = await fsStat(inputDir);
  if (!s.isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  const htmlFiles = await getHtmlFiles(inputDir);
  if (htmlFiles.length === 0) {
    throw new Error("No .html files found in the input directory.");
  }

  const format: Format = options.format ?? (await detectFormat(htmlFiles));
  await mkdir(outputDir, { recursive: true });

  let socialFormat: SocialFormat | undefined;
  let viewport: { width: number; height: number };

  if (format === "slides") {
    viewport = { width: 1920, height: 1080 };
  } else if (format === "docs") {
    viewport = { width: 794, height: 1123 };
  } else {
    socialFormat = await resolveSocialFormat(htmlFiles, options.socialFormat);
    viewport = getSocialViewport(socialFormat);
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
  });

  const outputFiles: string[] = [];

  try {
    for (const filePath of htmlFiles) {
      const name = basename(filePath);
      const page = await context.newPage();

      await page.goto(`file://${filePath}`, { waitUntil: "load" });

      await page.waitForFunction(
        () => {
          const styles = document.querySelectorAll("style");
          return Array.from(styles).some((s) =>
            s.textContent?.includes("--tw-")
          );
        },
        { timeout: 10_000 }
      );

      await page.evaluate(() => document.fonts.ready);

      if (format === "docs") {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".pdf"));
        await page.pdf({
          path: outputPath,
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        outputFiles.push(outputPath);
      } else {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".png"));
        await page.screenshot({
          path: outputPath,
          fullPage: true,
          type: "png",
        });
        outputFiles.push(outputPath);
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return { files: outputFiles, format, socialFormat };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/core/renderer-social.test.ts
bun test tests/core/renderer.test.ts
```

Expected: all pass (existing slides test + 5 new social tests). If Playwright complains about missing browsers, run `bun run scripts/setup.ts` first.

- [ ] **Step 5: Commit**

```bash
git add src/core/renderer.ts tests/core/renderer-social.test.ts
git commit -m "feat(renderer): social format branch with viewport resolution"
```

---

### Task 6: Overflow detection for social slides

**Files:**
- Modify: `src/core/renderer.ts`
- Modify: `tests/core/renderer-social.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/core/renderer-social.test.ts`:

```typescript
test("throws explicit error when social content overflows viewport", async () => {
  const input = join(tempDir, "overflow");
  const output = join(tempDir, "out-overflow");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(input, { recursive: true });
  // body forced to be taller than 1080 viewport
  await writeFile(
    join(input, "01.html"),
    `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
     <body data-social-format="post-1-1" class="m-0 p-0 bg-zinc-950 text-white">
       <div style="height: 2000px; width: 1080px;">overflows</div>
     </body></html>`
  );
  await expect(
    renderPages({
      inputDir: input,
      outputDir: output,
      format: "social",
      scale: 1,
    })
  ).rejects.toThrow(/overflow/i);
}, 30_000);
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/renderer-social.test.ts
```

Expected: the overflow test fails — renderer currently screenshots the full scrolled page without error.

- [ ] **Step 3: Add overflow check to renderer**

In `src/core/renderer.ts`, inside the main `for (const filePath of htmlFiles)` loop, after `await page.evaluate(() => document.fonts.ready);` and before the format branch, add:

```typescript
      if (format === "social") {
        const overflow = await page.evaluate(
          (h) => {
            return {
              scrollHeight: document.documentElement.scrollHeight,
              viewportHeight: h,
            };
          },
          viewport.height
        );
        if (overflow.scrollHeight > overflow.viewportHeight + 2) {
          throw new Error(
            `Content overflow in "${name}": body scrollHeight ${overflow.scrollHeight}px > viewport ${overflow.viewportHeight}px. ` +
              `Reduce content, shorten text, or lower font sizes.`
          );
        }
      }
```

Also in the `catch/finally` surrounding the render loop, wrap the loop body in a try so any overflow error aborts cleanly. The existing `try/finally` already covers this — no extra wrapping needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/core/renderer-social.test.ts
```

Expected: overflow test passes alongside previous tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/renderer.ts tests/core/renderer-social.test.ts
git commit -m "feat(renderer): abort on social content overflow"
```

---

## Phase 3 — CLI integration

### Task 7: CLI accepts `--format social` and `--social-format`

**Files:**
- Modify: `scripts/render-pdf.ts`
- Create: `tests/scripts/cli-social.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/cli-social.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

let tempDir: string;
let input: string;
let output: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "cli-social-"));
  input = join(tempDir, "in");
  output = join(tempDir, "out");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(input, { recursive: true });
  await writeFile(
    join(input, "01.html"),
    `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
     <body data-social-format="post-1-1" class="m-0 p-0 bg-zinc-950 text-white">
       <div class="w-screen h-screen flex items-center justify-center"><h1>cli</h1></div>
     </body></html>`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("render-pdf CLI with --format social", () => {
  test("renders via --format social", async () => {
    await $`bun run scripts/render-pdf.ts ${input} --format social --output ${output} --scale 1`.quiet();
    const files = await readdir(output);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  }, 60_000);

  test("accepts --social-format override", async () => {
    const output2 = join(tempDir, "out2");
    const input2 = join(tempDir, "in2");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input2, { recursive: true });
    await writeFile(
      join(input2, "01.html"),
      `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
       <body class="m-0 p-0 bg-zinc-950 text-white"><div class="w-screen h-screen">ov</div></body></html>`
    );
    await $`bun run scripts/render-pdf.ts ${input2} --format social --social-format post-4-5 --output ${output2} --scale 1`.quiet();
    const files = await readdir(output2);
    expect(files.some((f) => f.endsWith(".png"))).toBe(true);
  }, 60_000);

  test("rejects invalid --social-format", async () => {
    const result = await $`bun run scripts/render-pdf.ts ${input} --format social --social-format post-16-9 --output ${output} --scale 1`
      .nothrow()
      .quiet();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toMatch(/post-16-9/);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/scripts/cli-social.test.ts
```

Expected: CLI doesn't recognize `social` or `--social-format` yet.

- [ ] **Step 3: Update `scripts/render-pdf.ts`**

Replace the full file content with:

```typescript
/**
 * render-pdf.ts — CLI wrapper for core renderer
 *
 * Usage:
 *   bun run scripts/render-pdf.ts <input-dir> [--format slides|docs|social] [--social-format <preset>] [--output <dir>] [--scale 2]
 */

import { resolve } from "node:path";
import { renderPages } from "../src/core/renderer";
import type { Format, SocialFormat } from "../src/core/types";
import {
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "../src/core/social-presets";

const args = process.argv.slice(2);
let inputDir = "";
let format: Format | undefined;
let socialFormat: SocialFormat | undefined;
let outputDir = "./output";
let scale = 2;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (val !== "slides" && val !== "docs" && val !== "social") {
      console.error(
        `Invalid format "${val}". Use "slides", "docs", or "social".`
      );
      process.exit(1);
    }
    format = val;
  } else if (arg === "--social-format") {
    const val = args[++i];
    if (!isValidSocialFormat(val)) {
      console.error(
        `Invalid --social-format "${val}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
      process.exit(1);
    }
    socialFormat = val;
  } else if (arg === "--output") {
    outputDir = args[++i];
    if (!outputDir) {
      console.error("Missing value for --output.");
      process.exit(1);
    }
  } else if (arg === "--scale") {
    scale = parseInt(args[++i], 10);
    if (isNaN(scale) || scale < 1 || scale > 4) {
      console.error("Scale must be 1-4. Default: 2.");
      process.exit(1);
    }
  } else if (!arg.startsWith("--")) {
    inputDir = arg;
  }
}

if (!inputDir) {
  console.error(
    "Usage: bun run scripts/render-pdf.ts <input-dir> [--format slides|docs|social] [--social-format <preset>] [--output <dir>] [--scale 2]"
  );
  process.exit(1);
}

try {
  const result = await renderPages({
    inputDir: resolve(inputDir),
    outputDir: resolve(outputDir),
    format,
    socialFormat,
    scale,
  });
  const suffix = result.socialFormat ? ` (${result.socialFormat})` : "";
  console.log(
    `\nRendered ${result.files.length} ${result.format}${suffix} files to ${resolve(outputDir)}`
  );
} catch (err) {
  console.error("Render error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/scripts/cli-social.test.ts
```

Expected: all three CLI tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-pdf.ts tests/scripts/cli-social.test.ts
git commit -m "feat(cli): --format social and --social-format flags"
```

---

## Phase 4 — Manifest generation

### Task 8: Manifest writer utility

**Files:**
- Create: `src/core/manifest.ts`
- Create: `tests/core/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/manifest.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeManifest } from "../../src/core/manifest";

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "manifest-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("writeManifest", () => {
  test("writes manifest.yaml with carousel metadata", async () => {
    const outputPath = join(tempDir, "manifest.yaml");
    await writeManifest({
      outputPath,
      format: "carousel-4-5",
      theme: "dark-editorial",
      slides: [
        { file: "01-hook.png", archetype: "cover", headline: "Test cover" },
        { file: "02-steps.png", archetype: "steps" },
      ],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("format: carousel-4-5");
    expect(content).toContain("theme: dark-editorial");
    expect(content).toContain("file: 01-hook.png");
    expect(content).toContain("archetype: cover");
    expect(content).toContain("generated_at:");
  });

  test("writes manifest without theme when omitted", async () => {
    const outputPath = join(tempDir, "no-theme.yaml");
    await writeManifest({
      outputPath,
      format: "post-1-1",
      slides: [{ file: "01.png", archetype: "quote" }],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("format: post-1-1");
    expect(content).not.toContain("theme:");
  });

  test("optional caption and hashtags included when provided", async () => {
    const outputPath = join(tempDir, "with-caption.yaml");
    await writeManifest({
      outputPath,
      format: "post-4-5",
      slides: [{ file: "01.png", archetype: "cover" }],
      caption: "Sample caption text",
      hashtags: ["#mvp", "#founder"],
    });
    const content = await readFile(outputPath, "utf-8");
    expect(content).toContain("caption_suggestion:");
    expect(content).toContain("Sample caption text");
    expect(content).toMatch(/['"]#mvp['"]/);
    expect(content).toMatch(/['"]#founder['"]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/core/manifest.test.ts
```

Expected: module not found.

- [ ] **Step 3: Create `src/core/manifest.ts`**

```typescript
import { writeFile } from "node:fs/promises";
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bun test tests/core/manifest.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/manifest.ts tests/core/manifest.test.ts
git commit -m "feat(manifest): writer for carousel metadata YAML"
```

---

### Task 9: CLI script `generate-manifest.ts`

**Files:**
- Create: `scripts/generate-manifest.ts`
- Create: `tests/scripts/generate-manifest.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/generate-manifest.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

let tempDir: string;
let renderedDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "gen-manifest-"));
  renderedDir = join(tempDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(renderedDir, { recursive: true });
  await writeFile(join(renderedDir, "01-hook.png"), "fake");
  await writeFile(join(renderedDir, "02-body.png"), "fake");
  await writeFile(join(renderedDir, "03-cta.png"), "fake");
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generate-manifest CLI", () => {
  test("creates manifest.yaml listing all PNGs", async () => {
    await $`bun run scripts/generate-manifest.ts ${renderedDir} --format post-4-5 --archetype cover,body,cta`.quiet();
    const files = await readdir(renderedDir);
    expect(files).toContain("manifest.yaml");
    const content = await readFile(join(renderedDir, "manifest.yaml"), "utf-8");
    expect(content).toContain("file: 01-hook.png");
    expect(content).toContain("file: 02-body.png");
    expect(content).toContain("file: 03-cta.png");
    expect(content).toContain("archetype: cover");
    expect(content).toContain("archetype: body");
    expect(content).toContain("archetype: cta");
  });

  test("fails when --format missing", async () => {
    const result = await $`bun run scripts/generate-manifest.ts ${renderedDir}`
      .nothrow()
      .quiet();
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/scripts/generate-manifest.test.ts
```

Expected: script does not exist.

- [ ] **Step 3: Create `scripts/generate-manifest.ts`**

```typescript
/**
 * generate-manifest.ts — build manifest.yaml for a social render output
 *
 * Usage:
 *   bun run scripts/generate-manifest.ts <rendered-dir> --format <social-format> [--archetype cover,body,cta] [--theme <name>] [--caption <text>] [--hashtags tag1,tag2]
 */

import { resolve, join } from "node:path";
import { readdir } from "node:fs/promises";
import { writeManifest, type ManifestSlide } from "../src/core/manifest";
import {
  isValidSocialFormat,
  SOCIAL_FORMAT_VALUES,
} from "../src/core/social-presets";
import type { SocialFormat } from "../src/core/types";

const args = process.argv.slice(2);
let renderedDir = "";
let format: SocialFormat | undefined;
let archetypes: string[] = [];
let theme: string | undefined;
let caption: string | undefined;
let hashtags: string[] = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (!isValidSocialFormat(val)) {
      console.error(
        `Invalid --format "${val}". Valid: ${SOCIAL_FORMAT_VALUES.join(", ")}`
      );
      process.exit(1);
    }
    format = val;
  } else if (arg === "--archetype") {
    archetypes = args[++i].split(",").map((a) => a.trim()).filter(Boolean);
  } else if (arg === "--theme") {
    theme = args[++i];
  } else if (arg === "--caption") {
    caption = args[++i];
  } else if (arg === "--hashtags") {
    hashtags = args[++i].split(",").map((h) => h.trim()).filter(Boolean);
  } else if (!arg.startsWith("--")) {
    renderedDir = arg;
  }
}

if (!renderedDir || !format) {
  console.error(
    "Usage: bun run scripts/generate-manifest.ts <rendered-dir> --format <social-format> [options]"
  );
  process.exit(1);
}

const resolvedDir = resolve(renderedDir);
const entries = await readdir(resolvedDir);
const pngs = entries.filter((f) => f.endsWith(".png")).sort();

if (pngs.length === 0) {
  console.error(`No .png files found in ${resolvedDir}`);
  process.exit(1);
}

const slides: ManifestSlide[] = pngs.map((file, i) => ({
  file,
  archetype: archetypes[i] ?? "unknown",
}));

const outputPath = join(resolvedDir, "manifest.yaml");
await writeManifest({
  outputPath,
  format,
  theme,
  slides,
  caption,
  hashtags,
});
console.log(`Wrote ${outputPath}`);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/scripts/generate-manifest.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-manifest.ts tests/scripts/generate-manifest.test.ts
git commit -m "feat(manifest): CLI to generate manifest.yaml from rendered dir"
```

---

## Phase 5 — Shared template scaffolding

### Task 10: Shared boilerplate HTML for social templates

**Files:**
- Create: `assets/templates/social/_shared/boilerplate.html`

- [ ] **Step 1: Create the boilerplate**

```html
<!--
  Social template boilerplate.
  Copy this file, set data-social-format, and replace the comment-marked slots.
  Renderer auto-selects viewport based on data-social-format.
-->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Social post</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap"
    rel="stylesheet"
  />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          letterSpacing: {
            display: "-0.1em",
            heading: "-0.06em",
            body: "-0.025em",
            label: "-0.01em",
          },
        },
      },
    };
  </script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body data-social-format="<!-- REPLACE: post-1-1|post-4-5|carousel-1-1|carousel-4-5|story -->" class="m-0 p-0 bg-zinc-950 text-white">
  <!-- REPLACE: content goes here, sized to viewport via w-screen h-screen -->
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add assets/templates/social/_shared/boilerplate.html
git commit -m "feat(templates): shared boilerplate for social HTML"
```

---

### Task 11: Type scales reference

**Files:**
- Create: `assets/templates/social/_shared/type-scales.md`

- [ ] **Step 1: Create type-scales.md**

````markdown
# Social — Type Scales per Aspect Ratio

Calibrated from pdf-forge's existing slide/doc scales, scaled for Instagram viewports. Use these exact values in archetype templates — do not improvise sizes.

## Viewport context

| Format | Width × Height | Carousel |
|---|---|---|
| `post-1-1` | 1080 × 1080 | No |
| `post-4-5` | 1080 × 1350 | No |
| `carousel-1-1` | 1080 × 1080 | Yes |
| `carousel-4-5` | 1080 × 1350 | Yes |
| `story` | 1080 × 1920 | No |

`carousel-*` shares the viewport of its matching `post-*` — the scale table applies equally.

## Scale per format

### `post-1-1` / `carousel-1-1`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-lg font-mono uppercase tracking-label` | Category tags, markers |
| Hero Heading | `text-5xl font-semibold tracking-heading leading-tight` | Cover titles, main headline |
| Sub Heading | `text-3xl font-semibold tracking-heading` | Sub-titles, second-line |
| Body | `text-xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs, descriptions |
| Caption | `text-base text-zinc-500 font-light tracking-body` | Metadata, attribution |
| Big Number | `text-[120px] font-bold leading-none tracking-display` | Stats, KPIs |
| Mega Number | `text-[180px] font-bold leading-none tracking-display` | Hero metric |

### `post-4-5` / `carousel-4-5`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-xl font-mono uppercase tracking-label` | Category tags, markers |
| Hero Heading | `text-6xl font-semibold tracking-heading leading-tight` | Cover titles |
| Sub Heading | `text-4xl font-semibold tracking-heading` | Sub-titles |
| Body | `text-2xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs |
| Caption | `text-lg text-zinc-500 font-light tracking-body` | Metadata |
| Big Number | `text-[140px] font-bold leading-none tracking-display` | Stats |
| Mega Number | `text-[200px] font-bold leading-none tracking-display` | Hero metric |

### `story`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-2xl font-mono uppercase tracking-label` | Markers, tags |
| Hero Heading | `text-7xl font-semibold tracking-heading leading-tight` | Main headline |
| Sub Heading | `text-5xl font-semibold tracking-heading` | Secondary line |
| Body | `text-3xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs |
| Caption | `text-xl text-zinc-500 font-light tracking-body` | Meta, dates |
| Big Number | `text-[180px] font-bold leading-none tracking-display` | Stats |
| Mega Number | `text-[240px] font-bold leading-none tracking-display` | Hero metric |

## Rules

- Never use positive `tracking-wide` / `tracking-wider` / `tracking-widest`. Positive letter-spacing is the top marker of AI-sloppy output.
- Always pair hero + sub + body at visible size jumps — if they are within 1 step of each other, the hierarchy reads flat.
- The mega number gradient (`bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent`) appears at most once per slide, never on multiple elements.
````

- [ ] **Step 2: Commit**

```bash
git add assets/templates/social/_shared/type-scales.md
git commit -m "docs(templates): type scales per social aspect ratio"
```

---

### Task 12: Safe zones reference

**Files:**
- Create: `assets/templates/social/_shared/safe-zones.md`

- [ ] **Step 1: Create safe-zones.md**

```markdown
# Social — Safe Zones per Format

Instagram overlays UI chrome on certain formats. These zones must remain free of critical content (logos, headlines, key text, clickable CTAs).

## Per format

### `post-1-1` / `post-4-5` / `carousel-1-1` / `carousel-4-5`

No critical overlay zones. Feed posts render edge-to-edge inside the grid, cropped only by the user's thumb when scrolling.

Apply interior padding anyway for visual breathing room:

- Minimum padding: `p-[96px]` on all sides
- Preferred: `p-[120px]` for post-4-5 (more vertical space lets content breathe)
- Bottom padding extra for `@handle` footer when `default_footer: true`: add `pb-[144px]`

### `story`

Two zones are covered by Instagram's Story UI — never place critical content there:

| Zone | Y range | Covered by |
|---|---|---|
| Top | 0 - 250px | Profile avatar, username, timestamp, 3-dot menu, close button |
| Bottom | 1640 - 1920px | Reply bar, reaction button, send arrow, progress indicators |

Critical content lives in `y: 250 - 1640` (1390px of safe height).

Apply via Tailwind: wrap content in `<div class="pt-[250px] pb-[280px] h-screen flex flex-col justify-between">` so top/bottom padding is respected automatically.

## Carousel slide-1 swipe indicator

First slide of a carousel should include a visual cue that more follows. Two options:

1. **Page counter**: `01/07` in top-right, `text-sm font-mono text-zinc-500`.
2. **Swipe arrow**: `→` or `Deslize →` in bottom-right of slide-1 only.

Generated automatically by the carousel helper; manual templates can include either.

## Verification

Render the template, then overlay a safe-zone mask in image-editor or via the `--preview` grid. If critical text disappears behind the Story UI mockup, redesign the layout — never let the platform crop meaning.
```

- [ ] **Step 2: Commit**

```bash
git add assets/templates/social/_shared/safe-zones.md
git commit -m "docs(templates): safe zones per social format"
```

---

## Phase 6 — Reference archetype: cover

### Task 13: Cover archetype — all five format variants

**Files:**
- Create: `assets/templates/social/cover/post-1-1.html`
- Create: `assets/templates/social/cover/post-4-5.html`
- Create: `assets/templates/social/cover/carousel-1-1.html`
- Create: `assets/templates/social/cover/carousel-4-5.html`
- Create: `assets/templates/social/cover/story.html`
- Create: `assets/templates/social/cover/NOTES.md`

- [ ] **Step 1: Create `cover/post-1-1.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover — post 1:1</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = { theme: { extend: { letterSpacing: { display: "-0.1em", heading: "-0.06em", body: "-0.025em", label: "-0.01em" } } } };
  </script>
  <style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body data-social-format="post-1-1" class="m-0 p-0 bg-zinc-950 text-white">
  <div class="w-screen h-screen relative overflow-hidden p-[96px] flex flex-col justify-end">
    <div class="absolute top-0 right-0 w-[480px] h-[480px] bg-orange-600/10 blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
    <div class="relative z-10">
      <div class="text-lg font-mono uppercase tracking-label text-zinc-500 mb-6">
        <!-- REPLACE: section label, e.g. "guide #12" -->
      </div>
      <h1 class="text-5xl font-semibold tracking-heading leading-tight text-white">
        <!-- REPLACE: headline with one gradient word -->
        Como construir <span class="bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">produtos</span> que vendem sozinhos
      </h1>
      <div class="mt-8 text-base text-zinc-500 font-light tracking-body">
        <!-- REPLACE: optional sub-caption or @handle -->
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 2: Create `cover/post-4-5.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover — post 4:5</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = { theme: { extend: { letterSpacing: { display: "-0.1em", heading: "-0.06em", body: "-0.025em", label: "-0.01em" } } } };
  </script>
  <style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body data-social-format="post-4-5" class="m-0 p-0 bg-zinc-950 text-white">
  <div class="w-screen h-screen relative overflow-hidden p-[120px] flex flex-col justify-end">
    <div class="absolute top-0 right-0 w-[520px] h-[520px] bg-orange-600/10 blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
    <div class="relative z-10">
      <div class="text-xl font-mono uppercase tracking-label text-zinc-500 mb-8">
        <!-- REPLACE: section label -->
      </div>
      <h1 class="text-6xl font-semibold tracking-heading leading-tight text-white">
        <!-- REPLACE: headline with one gradient word -->
        Como construir <span class="bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">produtos</span> que vendem sozinhos
      </h1>
      <div class="mt-10 text-lg text-zinc-500 font-light tracking-body">
        <!-- REPLACE: optional sub-caption or @handle -->
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 3: Create `cover/carousel-1-1.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover — carousel 1:1</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = { theme: { extend: { letterSpacing: { display: "-0.1em", heading: "-0.06em", body: "-0.025em", label: "-0.01em" } } } };
  </script>
  <style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body data-social-format="carousel-1-1" class="m-0 p-0 bg-zinc-950 text-white">
  <div class="w-screen h-screen relative overflow-hidden p-[96px] flex flex-col justify-between">
    <div class="absolute top-0 right-0 w-[480px] h-[480px] bg-orange-600/10 blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
    <div class="relative z-10 flex justify-between items-start">
      <div class="text-lg font-mono uppercase tracking-label text-zinc-500">
        <!-- REPLACE: section label -->
      </div>
      <div class="text-sm font-mono text-zinc-600">
        <!-- REPLACE: slide counter, e.g. "01/07" -->01/07
      </div>
    </div>
    <div class="relative z-10">
      <h1 class="text-5xl font-semibold tracking-heading leading-tight text-white">
        <!-- REPLACE: headline with one gradient word -->
        Como construir <span class="bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">produtos</span> que vendem sozinhos
      </h1>
      <div class="mt-8 text-base text-zinc-500 font-light tracking-body flex items-center gap-3">
        Deslize <span class="text-lg">→</span>
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 4: Create `cover/carousel-4-5.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover — carousel 4:5</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = { theme: { extend: { letterSpacing: { display: "-0.1em", heading: "-0.06em", body: "-0.025em", label: "-0.01em" } } } };
  </script>
  <style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body data-social-format="carousel-4-5" class="m-0 p-0 bg-zinc-950 text-white">
  <div class="w-screen h-screen relative overflow-hidden p-[120px] flex flex-col justify-between">
    <div class="absolute top-0 right-0 w-[520px] h-[520px] bg-orange-600/10 blur-[100px] -translate-y-1/3 translate-x-1/3"></div>
    <div class="relative z-10 flex justify-between items-start">
      <div class="text-xl font-mono uppercase tracking-label text-zinc-500">
        <!-- REPLACE: section label -->
      </div>
      <div class="text-base font-mono text-zinc-600">
        <!-- REPLACE: slide counter -->01/07
      </div>
    </div>
    <div class="relative z-10">
      <h1 class="text-6xl font-semibold tracking-heading leading-tight text-white">
        <!-- REPLACE: headline with one gradient word -->
        Como construir <span class="bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">produtos</span> que vendem sozinhos
      </h1>
      <div class="mt-10 text-lg text-zinc-500 font-light tracking-body flex items-center gap-3">
        Deslize <span class="text-xl">→</span>
      </div>
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 5: Create `cover/story.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cover — story 9:16</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = { theme: { extend: { letterSpacing: { display: "-0.1em", heading: "-0.06em", body: "-0.025em", label: "-0.01em" } } } };
  </script>
  <style>*{box-sizing:border-box}html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif}</style>
</head>
<body data-social-format="story" class="m-0 p-0 bg-zinc-950 text-white">
  <div class="w-screen h-screen relative overflow-hidden pt-[250px] pb-[280px] px-[96px] flex flex-col justify-between">
    <div class="absolute top-[250px] right-0 w-[560px] h-[560px] bg-orange-600/10 blur-[100px]"></div>
    <div class="relative z-10">
      <div class="text-2xl font-mono uppercase tracking-label text-zinc-500 mb-10">
        <!-- REPLACE: section label -->
      </div>
      <h1 class="text-7xl font-semibold tracking-heading leading-tight text-white">
        <!-- REPLACE: headline with one gradient word -->
        Como construir <span class="bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent">produtos</span> que vendem sozinhos
      </h1>
    </div>
    <div class="relative z-10 text-xl text-zinc-500 font-light tracking-body">
      <!-- REPLACE: optional @handle or CTA hint -->
    </div>
  </div>
</body>
</html>
```

- [ ] **Step 6: Create `cover/NOTES.md`**

```markdown
# Cover archetype — NOTES

Opening slide for a post or carousel. Primary job: create enough curiosity to earn the next glance.

## When to use

- First slide of a carousel (always)
- Standalone post when the headline itself is the payload (quote-like posts)
- Story cover when the content is educational/announcement rather than casual

## Variants

| File | Format | Notes |
|---|---|---|
| `post-1-1.html` | Post 1:1 | Bottom-anchored headline, top-right glow |
| `post-4-5.html` | Post 4:5 | Same layout, taller breathing room |
| `carousel-1-1.html` | Carousel 1:1 | Adds slide counter + `Deslize →` hint |
| `carousel-4-5.html` | Carousel 4:5 | Same carousel cues, portrait spacing |
| `story.html` | Story 9:16 | Headline mid-slide, respects top/bottom safe zones |

## REPLACE slots

- Section label (`text-*-mono uppercase tracking-label`): category, guide number, series tag
- Headline: 6-14 words max; wrap the key noun in the gradient span
- Sub-caption / @handle: optional one-liner below
- (Carousel only) Slide counter: `NN/TT` updated automatically or hand-set

## Design rules locked in

- One gradient word max per headline (the "one accent, one moment" rule)
- Orange-600/10 glow positioned top-right — structural depth, not decoration
- Zinc-500 label / white headline / zinc-500 body creates a clear three-step hierarchy
- Never add a second accent color to the cover — let the gradient be the entire visual punctuation

## Anti-patterns to avoid

- Centering both label and headline: kills rhythm, reads as template
- Full-white headline with gradient on a non-key word: the eye lands wrong
- More than one line of sub-caption: competes with the hook
- Replacing the gradient with a solid color: flattens the piece
```

- [ ] **Step 7: Commit**

```bash
git add assets/templates/social/cover/
git commit -m "feat(templates): cover archetype for all 5 social formats"
```

---

### Task 14: Integration test — render cover archetype end-to-end

**Files:**
- Create: `tests/integration/cover-archetype.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/cover-archetype.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, copyFile, rm, stat, readdir } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { renderPages } from "../../src/core/renderer";
import { SOCIAL_FORMAT_VALUES, getSocialViewport } from "../../src/core/social-presets";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "cover-archetype-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("cover archetype renders for all 5 formats", () => {
  for (const fmt of SOCIAL_FORMAT_VALUES) {
    test(`cover/${fmt}.html renders to PNG with expected viewport`, async () => {
      const input = join(workDir, fmt);
      const output = join(workDir, `out-${fmt}`);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(input, { recursive: true });

      const src = join(REPO_ROOT, "assets/templates/social/cover", `${fmt}.html`);
      await copyFile(src, join(input, "01-cover.html"));

      const result = await renderPages({
        inputDir: input,
        outputDir: output,
        format: "social",
        scale: 1,
      });

      expect(result.socialFormat).toBe(fmt);
      expect(result.files).toHaveLength(1);

      const files = await readdir(output);
      expect(files).toContain("01-cover.png");

      const pngStat = await stat(join(output, "01-cover.png"));
      expect(pngStat.size).toBeGreaterThan(10_000);

      // viewport sanity: expected dimensions known from getSocialViewport
      const viewport = getSocialViewport(fmt);
      expect(viewport.width).toBe(1080);
      expect(viewport.height).toBeGreaterThan(0);
    }, 30_000);
  }
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
bun test tests/integration/cover-archetype.test.ts
```

Expected: 5 tests pass (one per format). This is a real end-to-end Playwright render, so expect the suite to take ~30-60s.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cover-archetype.test.ts
git commit -m "test(integration): cover archetype renders across all 5 formats"
```

---

## Phase 7 — Theme presets (bundled YAML references)

### Task 15: Bundled theme preset YAML files

**Files:**
- Create: `assets/themes/dark-editorial.yaml`
- Create: `assets/themes/light-editorial.yaml`
- Create: `assets/themes/warm-minimal.yaml`
- Create: `assets/themes/high-contrast-punch.yaml`
- Create: `assets/themes/newsprint.yaml`
- Create: `assets/themes/README.md`

- [ ] **Step 1: Create `dark-editorial.yaml`**

```yaml
# Dark editorial — pdf-forge default aesthetic adapted for Instagram.
# Zinc backbone, single purple→orange gradient accent, Inter typography.
name: dark-editorial
theme: dark
palette:
  bg: "#09090b"
  surface: "#18181b"
  surface_alt: "#27272a"
  text_primary: "#fafafa"
  text_secondary: "#a1a1aa"
  text_muted: "#71717a"
  border: "#27272a"
accent_gradient: "from-purple-400 to-orange-400"
accent_solid: "#a78bfa"
accent_warm: "#fb923c"
fonts:
  display:
    family: "Inter"
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  mono:
    family: "JetBrains Mono"
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500"
allow_photos: false
mood: "editorial tech — restrained, high-contrast, typographic-first"
```

- [ ] **Step 2: Create `light-editorial.yaml`**

```yaml
# Light editorial — inverted zinc scale for finance, legal, formal contexts.
name: light-editorial
theme: light
palette:
  bg: "#fafafa"
  surface: "#f4f4f5"
  surface_alt: "#e4e4e7"
  text_primary: "#09090b"
  text_secondary: "#52525b"
  text_muted: "#a1a1aa"
  border: "#d4d4d8"
accent_gradient: "from-purple-600 to-orange-600"
accent_solid: "#7c3aed"
accent_warm: "#ea580c"
fonts:
  display:
    family: "Inter"
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  mono:
    family: "JetBrains Mono"
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500"
allow_photos: false
mood: "formal editorial — calm, authoritative, report-grade"
```

- [ ] **Step 3: Create `warm-minimal.yaml`**

```yaml
# Warm minimal — cream + black with serif display. Kinfolk/Aesop territory.
name: warm-minimal
theme: light
palette:
  bg: "#f5f1ea"
  surface: "#ede5d8"
  surface_alt: "#e0d4c0"
  text_primary: "#1a1a1a"
  text_secondary: "#4a4a4a"
  text_muted: "#8a8a8a"
  border: "#d4c7b0"
accent_gradient: "from-stone-700 to-stone-900"
accent_solid: "#1a1a1a"
accent_warm: "#8b5e3c"
fonts:
  display:
    family: "Instrument Serif"
    url: "https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap"
  mono:
    family: "JetBrains Mono"
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500"
allow_photos: true
mood: "warm minimal — quiet luxury, serif display, generous whitespace"
```

- [ ] **Step 4: Create `high-contrast-punch.yaml`**

```yaml
# High contrast punch — pure black with magenta accent. Wanted: attention.
name: high-contrast-punch
theme: dark
palette:
  bg: "#000000"
  surface: "#0a0a0a"
  surface_alt: "#141414"
  text_primary: "#ffffff"
  text_secondary: "#d4d4d8"
  text_muted: "#71717a"
  border: "#27272a"
accent_gradient: "from-fuchsia-500 to-pink-500"
accent_solid: "#d946ef"
accent_warm: "#ec4899"
fonts:
  display:
    family: "Inter"
    url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  mono:
    family: "JetBrains Mono"
    url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500"
allow_photos: false
mood: "high contrast punch — loud, direct, unmissable"
```

- [ ] **Step 5: Create `newsprint.yaml`**

```yaml
# Newsprint — beige + serif + subtle texture. Essay/opinion feel.
name: newsprint
theme: light
palette:
  bg: "#f4efe6"
  surface: "#ebe5d8"
  surface_alt: "#ddd4c0"
  text_primary: "#1c1a17"
  text_secondary: "#4a4438"
  text_muted: "#877f6e"
  border: "#c9bfa8"
accent_gradient: "from-red-700 to-red-900"
accent_solid: "#991b1b"
accent_warm: "#b45309"
fonts:
  display:
    family: "Playfair Display"
    url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap"
  mono:
    family: "IBM Plex Mono"
    url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap"
allow_photos: true
mood: "newsprint — essayistic, long-form feel, literary"
```

- [ ] **Step 6: Create `assets/themes/README.md`**

```markdown
# Themes — bundled presets for `social` format

Each YAML file defines a theme Claude reads when composing social HTML. Reference a preset in `.claude/pdf-forge.local.md`:

```yaml
social:
  preset: "warm-minimal"
  # optional overrides below
  accent_gradient: "from-emerald-400 to-cyan-400"
```

## Available presets

| File | Mood | Theme | Photos |
|---|---|---|---|
| `dark-editorial.yaml` | editorial tech — restrained, high-contrast | dark | no |
| `light-editorial.yaml` | formal editorial — calm, report-grade | light | no |
| `warm-minimal.yaml` | quiet luxury, serif display, generous whitespace | light | yes |
| `high-contrast-punch.yaml` | loud, direct, unmissable | dark | no |
| `newsprint.yaml` | essayistic, long-form, literary | light | yes |

## Schema

Every preset defines:

- `name`: unique identifier (matches filename)
- `theme`: `dark | light` — controls default background/foreground
- `palette`: six tokens (`bg`, `surface`, `surface_alt`, `text_primary`, `text_secondary`, `text_muted`, `border`)
- `accent_gradient`: Tailwind gradient classes (for the "one accent, one moment" element)
- `accent_solid` / `accent_warm`: solid hex fallbacks for borders and labels
- `fonts.display` / `fonts.mono`: Google Fonts family + URL
- `allow_photos`: whether the `photo-overlay` archetype is enabled
- `mood`: human-readable one-liner Claude uses when deciding fit

## Adding a new preset

1. Copy any existing file to `<name>.yaml`
2. Update all fields — do not leave any as-is from the template
3. Reference it in a project's `.claude/pdf-forge.local.md` with `social.preset: <name>`
4. Document it in the table above
```

- [ ] **Step 7: Commit**

```bash
git add assets/themes/
git commit -m "feat(themes): bundled theme presets for social format"
```

---

## Phase 8 — Preview generator

### Task 16: Preview HTML generator

**Files:**
- Create: `scripts/generate-preview.ts`
- Create: `tests/scripts/generate-preview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/scripts/generate-preview.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

let tempDir: string;
let renderedDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "gen-preview-"));
  renderedDir = join(tempDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(renderedDir, { recursive: true });
  // minimal 1x1 PNGs (base64 of a valid red pixel)
  const redPx = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAIiLUMYAAAAASUVORK5CYII=",
    "base64"
  );
  await writeFile(join(renderedDir, "01-hook.png"), redPx);
  await writeFile(join(renderedDir, "02-body.png"), redPx);
  await writeFile(
    join(renderedDir, "manifest.yaml"),
    `carousel:
  format: post-4-5
  theme: dark-editorial
  generated_at: 2026-04-20T11:30:00-03:00
  slides:
    - file: 01-hook.png
      archetype: cover
    - file: 02-body.png
      archetype: steps
`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("generate-preview CLI", () => {
  test("writes preview.html listing all PNGs", async () => {
    await $`bun run scripts/generate-preview.ts ${renderedDir}`.quiet();
    const files = await readdir(renderedDir);
    expect(files).toContain("preview.html");
    const html = await readFile(join(renderedDir, "preview.html"), "utf-8");
    expect(html).toContain("01-hook.png");
    expect(html).toContain("02-body.png");
    expect(html).toContain("post-4-5");
    expect(html).toContain("dark-editorial");
    expect(html).toContain("<!DOCTYPE html>");
  });

  test("handles directory without manifest.yaml", async () => {
    const bare = join(tempDir, "bare");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(bare, { recursive: true });
    const redPx = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBAIiLUMYAAAAASUVORK5CYII=",
      "base64"
    );
    await writeFile(join(bare, "01.png"), redPx);
    await $`bun run scripts/generate-preview.ts ${bare}`.quiet();
    const html = await readFile(join(bare, "preview.html"), "utf-8");
    expect(html).toContain("01.png");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test tests/scripts/generate-preview.test.ts
```

Expected: script not found.

- [ ] **Step 3: Create `scripts/generate-preview.ts`**

```typescript
/**
 * generate-preview.ts — build preview.html grid for visual QA of social renders
 *
 * Usage:
 *   bun run scripts/generate-preview.ts <rendered-dir> [--output <path>]
 */

import { resolve, join, relative, dirname } from "node:path";
import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { load as yamlLoad } from "js-yaml";

interface ManifestShape {
  carousel?: {
    format?: string;
    theme?: string;
    generated_at?: string;
    slides?: Array<{ file?: string; archetype?: string; [extra: string]: unknown }>;
  };
  caption_suggestion?: string;
  hashtag_suggestion?: string[];
}

const args = process.argv.slice(2);
let renderedDir = "";
let outputPath: string | undefined;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output") {
    outputPath = args[++i];
  } else if (!arg.startsWith("--")) {
    renderedDir = arg;
  }
}

if (!renderedDir) {
  console.error("Usage: bun run scripts/generate-preview.ts <rendered-dir> [--output <path>]");
  process.exit(1);
}

const dir = resolve(renderedDir);
const finalOutput = outputPath ? resolve(outputPath) : join(dir, "preview.html");

const entries = await readdir(dir);
const pngs = entries.filter((f) => f.endsWith(".png")).sort();

let manifest: ManifestShape | null = null;
if (entries.includes("manifest.yaml")) {
  const raw = await readFile(join(dir, "manifest.yaml"), "utf-8");
  manifest = yamlLoad(raw) as ManifestShape;
}

const format = manifest?.carousel?.format ?? "unknown";
const theme = manifest?.carousel?.theme ?? "default";
const generatedAt = manifest?.carousel?.generated_at ?? new Date().toISOString();
const slideMeta = new Map<string, string>();
for (const slide of manifest?.carousel?.slides ?? []) {
  if (slide.file && slide.archetype) slideMeta.set(slide.file, slide.archetype);
}

const caption = manifest?.caption_suggestion ?? "";
const hashtags = manifest?.hashtag_suggestion ?? [];

const previewDir = dirname(finalOutput);
const pngsRelative = pngs.map((p) => relative(previewDir, join(dir, p)));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const slideCards = pngs
  .map((file, i) => {
    const archetype = slideMeta.get(file) ?? "—";
    return `
      <figure class="slide">
        <div class="slide-index">${String(i + 1).padStart(2, "0")}/${String(pngs.length).padStart(2, "0")}</div>
        <img src="${escapeHtml(pngsRelative[i])}" alt="${escapeHtml(file)}" />
        <figcaption>
          <div class="filename">${escapeHtml(file)}</div>
          <div class="archetype">${escapeHtml(archetype)}</div>
        </figcaption>
      </figure>
    `;
  })
  .join("\n");

const hashtagBlock =
  hashtags.length > 0
    ? `<div class="hashtags">${hashtags.map((h) => `<span>${escapeHtml(h)}</span>`).join(" ")}</div>`
    : "";
const captionBlock = caption
  ? `<pre class="caption">${escapeHtml(caption)}</pre>`
  : "";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Preview — ${escapeHtml(format)}</title>
  <style>
    body { margin: 0; background: #09090b; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; padding: 48px; }
    header { margin-bottom: 48px; }
    h1 { margin: 0 0 8px 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
    .meta { color: #a1a1aa; font-size: 14px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px; }
    .slide { margin: 0; background: #18181b; border-radius: 12px; overflow: hidden; position: relative; }
    .slide img { display: block; width: 100%; height: auto; }
    .slide-index { position: absolute; top: 12px; right: 12px; font-family: ui-monospace, monospace; font-size: 12px; color: #a1a1aa; background: rgba(9,9,11,0.7); padding: 4px 8px; border-radius: 4px; }
    figcaption { padding: 12px 16px; }
    .filename { font-family: ui-monospace, monospace; font-size: 13px; color: #e4e4e7; }
    .archetype { font-size: 12px; color: #71717a; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .caption { background: #18181b; border-radius: 8px; padding: 16px; margin-top: 48px; white-space: pre-wrap; color: #d4d4d8; font-family: inherit; font-size: 14px; line-height: 1.6; }
    .hashtags { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
    .hashtags span { font-family: ui-monospace, monospace; font-size: 12px; background: #27272a; color: #a78bfa; padding: 4px 10px; border-radius: 100px; }
  </style>
</head>
<body>
  <header>
    <h1>Preview — ${escapeHtml(format)}</h1>
    <div class="meta">${pngs.length} slide${pngs.length === 1 ? "" : "s"} · theme: ${escapeHtml(theme)} · generated: ${escapeHtml(generatedAt)}</div>
  </header>
  <div class="grid">
    ${slideCards}
  </div>
  ${captionBlock}
  ${hashtagBlock}
</body>
</html>
`;

await writeFile(finalOutput, html, "utf-8");
console.log(`Wrote ${finalOutput}`);
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/scripts/generate-preview.test.ts
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-preview.ts tests/scripts/generate-preview.test.ts
git commit -m "feat(preview): HTML grid generator for social render QA"
```

---

## Phase 9 — Documentation

### Task 17: Update `SKILL.md` with social workflow

**Files:**
- Modify: `skills/pdf-forge/SKILL.md`

- [ ] **Step 1: Update the description frontmatter**

In `skills/pdf-forge/SKILL.md`, expand the `description:` block at the top to add Instagram triggers. The existing block ends with:

```yaml
  Use this skill even for simple PDF requests — it ensures professional quality by default.
```

Replace that line with:

```yaml
  Use this skill even for simple PDF requests — it ensures professional quality by default.
  Also triggers for Instagram content: "create an Instagram post", "make a carousel",
  "generate a story cover", "design social media creatives", "Instagram carrossel",
  "reels cover", or mentions of posting to Instagram, aspect ratios (1:1, 4:5, 9:16),
  or "creatives from references" (Reference Mode — feed images, extract visual grammar).
```

- [ ] **Step 2: Add a new workflow section after step 6**

Find the section "### 6. Render to PDF" in `skills/pdf-forge/SKILL.md`. After its closing paragraph (the one that says `The render script auto-detects the format (slides vs docs) from the HTML content.`), insert this new subsection before `## Design Rules`:

```markdown
## Workflow — Social (Instagram)

### 1. Detect Sub-Format

When the user requests Instagram content, pick the sub-format:

- `post-1-1` (1080×1080): classic feed, single post
- `post-4-5` (1080×1350): feed portrait — default for modern editorial
- `carousel-1-1` / `carousel-4-5`: multiple slides, same ratio
- `story` (1080×1920): Story or Reels cover

If ambiguous, ask. Feed post default is `post-4-5`.

### 2. Read Theme Preset

Check `.claude/pdf-forge.local.md` for a `social:` block. Key fields:

- `preset`: name of bundled theme from `assets/themes/` (e.g. `dark-editorial`, `warm-minimal`)
- `theme`, `accent_gradient`, `custom_palette`, `fonts_override`: override any preset field
- `brand_handle`, `default_footer`: branding automation
- `allow_photos`: gates the photo-overlay archetype

If no `social:` block, defaults to `dark-editorial` preset.

Read `assets/themes/README.md` for the full preset list.

### 3. Plan the Sequence (Carousel) or Layout (Single Post)

For carousels, pick 3-10 slides following a narrative:

```
01-cover         → archetype: cover (hook)
02-setup         → archetype: definition or steps
03-content       → archetype: stat/steps/quote
...
0N-cta           → archetype: cta (final)
```

For single posts, pick one archetype matching the content goal.

Archetype catalog: `assets/templates/social/<archetype>/<format>.html`.

### 4. Generate HTML Pages

Copy the matching format variant of each archetype and replace `<!-- REPLACE: ... -->` slots with content.

Every file must include `data-social-format="<sub-format>"` on `<body>` — the renderer relies on it for viewport selection.

For custom compositions (escape hatch, no matching archetype), write HTML from scratch using `_shared/boilerplate.html`, respecting type scales (`_shared/type-scales.md`) and safe zones (`_shared/safe-zones.md`).

### 5. Render to PNG

```bash
bun run scripts/render-pdf.ts ./pages/ --format social --output ./rendered/
```

One PNG per HTML, named from the source filename. Renderer aborts on overflow (body taller than viewport) and on carousel format mismatch.

### 6. Generate Manifest

```bash
bun run scripts/generate-manifest.ts ./rendered/ --format carousel-4-5 --theme dark-editorial --archetype cover,definition,steps,quote,cta
```

Writes `manifest.yaml` with slide metadata ready for publish tooling or archival.

### 7. (Optional) Generate Preview

```bash
bun run scripts/generate-preview.ts ./rendered/
```

Opens in browser — shows all slides as a grid, with captions and hashtags if present in the manifest.

## Reference Mode

When the user attaches images of other creatives as inspiration, follow this workflow:

### Step 1: Analyze each reference

For every reference image, describe in text what you see:

1. **Grid & layout**: title position, alignment, density, margins
2. **Palette**: 3 dominant colors, background tone, mono/di/polychrome
3. **Typography**: serif/sans, weight contrast, tracking (positive/negative/zero), size hierarchy
4. **Density**: content/whitespace ratio (dense/balanced/spacious)
5. **Visual elements**: photo, illustration, blocks, borders, shadows, textures
6. **Mood**: editorial / tech / playful / brutalist / minimal / maximal
7. **Nearest archetype**: which internal archetype maps closest

Pause for user correction before generating — if you read the palette or mood wrong, the output compounds the mistake.

### Step 2: Pick fidelity mode

- **Close match**: copy the grammar with maximum fidelity. Bypass templates; compose custom HTML.
- **Style transfer** (default): take the archetype template for the detected archetype, override palette/fonts/density from the reference.
- **Loose inspiration**: keep the brand config theme, borrow only 1-2 elements from the reference.

Ask the user if ambiguous. Default to `style transfer`.

### Step 3: Generate respecting guardrails

- Never copy logos or literal text from the reference
- Safe zones of the target format always apply (even if the reference breaks them)
- If reference format differs from target, reposition rather than stretch
- Commercial fonts replaced by similar Google Fonts; document the substitution in output
```

- [ ] **Step 3: Expand the Template Files table**

Find the `## Template Files` section. After the Documents table, add:

```markdown
### Social — Instagram (`assets/templates/social/`)

Each archetype has five format variants: `post-1-1.html`, `post-4-5.html`, `carousel-1-1.html`, `carousel-4-5.html`, `story.html`. See the archetype's `NOTES.md` for variants and slot conventions.

| Archetype | Purpose |
|----------|---------|
| `cover/` | Opening slide — carousel hook or bold single-post headline |
| `mega-stat/` | One huge number centered — ROI, percentage, hero metric *(planned)* |
| `steps/` | Numbered list — framework, how-to, playbook *(planned)* |
| `quote/` | Centered pull quote with attribution *(planned)* |
| `before-after/` | Split view — problem vs solution, cost vs return *(planned)* |
| `definition/` | Term + explanation — glossary, concept card *(planned)* |
| `checklist/` | Bullet/check marks list — tips, to-dos *(planned)* |
| `cta/` | Final slide — follow/save/link *(planned)* |
| `photo-overlay/` | Image background + text overlay *(planned, requires `allow_photos: true`)* |
| `bento/` | Asymmetric grid of cards — features, services *(planned)* |

Shared resources: `_shared/boilerplate.html`, `_shared/type-scales.md`, `_shared/safe-zones.md`.

*(planned)* archetypes fall back to custom HTML composition via the boilerplate. When a follow-up plan lands with all archetypes, this table updates.
```

- [ ] **Step 4: Add Social quick-reference to the bottom**

Find `## Quick Type Reference`. At the end of that section (after the documents block), add:

```markdown
### Social (varies by aspect ratio)

Full tables in `assets/templates/social/_shared/type-scales.md`. Key highlights:

- `post-4-5` hero heading: `text-6xl font-semibold tracking-heading leading-tight`
- `post-4-5` mega number: `text-[200px] font-bold leading-none tracking-display`
- `story` hero heading: `text-7xl font-semibold tracking-heading leading-tight`
- Safe-zone padding for story: `pt-[250px] pb-[280px]` on wrapping div
```

- [ ] **Step 5: Commit**

```bash
git add skills/pdf-forge/SKILL.md
git commit -m "docs(skill): add social workflow and reference mode sections"
```

---

### Task 18: Update README.md brand config schema example

**Files:**
- Modify: `README.md:100-117`

- [ ] **Step 1: Replace the brand customization section**

In `README.md`, find the block starting `## Brand Customization` and ending before `## Templates`. Replace the YAML example and surrounding text with:

```markdown
## Brand Customization

Create `.claude/pdf-forge.local.md` in your project:

```yaml
---
brand:
  name: "Your Company"
  primary: "purple-500"
  secondary: "orange-500"
  theme: "dark"
font:
  url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  family: "Inter"
# Optional: Instagram content configuration
social:
  preset: "dark-editorial"
  allow_photos: false
  brand_handle: "@yourhandle"
  default_footer: true
---
```

Without this file, defaults apply: dark theme, Inter font, purple/orange accents. The optional `social:` block enables Instagram output configuration — reference any preset from `assets/themes/` or inline-override individual fields.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): document social config block in brand customization"
```

---

### Task 19: Add social template table to README Templates section

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Append social section after the Documents table**

In `README.md`, find the Documents table under `### Documents (A4)`. After the last row of that table, append:

```markdown

### Social — Instagram (various aspect ratios)

| Format | Viewport | Use Case |
|--------|----------|----------|
| post-1-1 | 1080×1080 | Square feed post |
| post-4-5 | 1080×1350 | Portrait feed post (default for editorial) |
| carousel-1-1 | 1080×1080 | Square carousel (N slides) |
| carousel-4-5 | 1080×1350 | Portrait carousel |
| story | 1080×1920 | Story / Reels cover |

Ten archetypes planned; `cover` ships with this release. Remaining archetypes (mega-stat, steps, quote, before-after, definition, checklist, cta, photo-overlay, bento) added in the archetype-library follow-up plan. Custom HTML composition always works as an escape hatch via `assets/templates/social/_shared/boilerplate.html`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(readme): add social format table"
```

---

## Phase 10 — Full-pipeline integration

### Task 20: End-to-end carousel integration test

**Files:**
- Create: `tests/integration/carousel-pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/carousel-pipeline.test.ts`:

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, copyFile, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { $ } from "bun";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

let workDir: string;
let pagesDir: string;
let renderedDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(join(tmpdir(), "carousel-pipeline-"));
  pagesDir = join(workDir, "pages");
  renderedDir = join(workDir, "rendered");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(pagesDir, { recursive: true });

  // Use 3 copies of cover/carousel-4-5 as a synthetic carousel
  const src = join(REPO_ROOT, "assets/templates/social/cover/carousel-4-5.html");
  await copyFile(src, join(pagesDir, "01-hook.html"));
  await copyFile(src, join(pagesDir, "02-middle.html"));
  await copyFile(src, join(pagesDir, "03-cta.html"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("full social carousel pipeline", () => {
  test("render → manifest → preview produces all expected artifacts", async () => {
    // 1. render
    await $`bun run scripts/render-pdf.ts ${pagesDir} --format social --output ${renderedDir} --scale 1`.quiet();
    let files = await readdir(renderedDir);
    expect(files.filter((f) => f.endsWith(".png"))).toHaveLength(3);

    // 2. manifest
    await $`bun run scripts/generate-manifest.ts ${renderedDir} --format carousel-4-5 --theme dark-editorial --archetype cover,cover,cover`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("manifest.yaml");
    const manifest = await readFile(join(renderedDir, "manifest.yaml"), "utf-8");
    expect(manifest).toContain("format: carousel-4-5");
    expect(manifest).toContain("theme: dark-editorial");
    expect(manifest).toContain("01-hook.png");
    expect(manifest).toContain("03-cta.png");

    // 3. preview
    await $`bun run scripts/generate-preview.ts ${renderedDir}`.quiet();
    files = await readdir(renderedDir);
    expect(files).toContain("preview.html");
    const preview = await readFile(join(renderedDir, "preview.html"), "utf-8");
    expect(preview).toContain("01-hook.png");
    expect(preview).toContain("carousel-4-5");
    expect(preview).toContain("dark-editorial");
  }, 120_000);
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
bun test tests/integration/carousel-pipeline.test.ts
```

Expected: passes after Playwright runs three renders + manifest + preview. Up to 2min.

- [ ] **Step 3: Run the complete test suite**

```bash
bun test
bun run typecheck
```

Expected: all tests pass, no TypeScript errors. If `bun run typecheck` is not defined, run:

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add tests/integration/carousel-pipeline.test.ts
git commit -m "test(integration): full carousel pipeline render-manifest-preview"
```

---

## Final verification

- [ ] **Run the complete test suite**

```bash
bun test
```

Expected: all tests green (unit + integration). No skipped tests.

- [ ] **Verify build still works**

```bash
bun run build
```

Expected: tsup builds `dist/` without errors.

- [ ] **Confirm branch state is ready for merge**

```bash
git log --oneline main..HEAD
git status
```

Expected: clean working tree, ~20 focused commits on `feat/social-format` branch.

- [ ] **Create a live example post (manual QA)**

Create a fresh working directory and exercise the full flow end-to-end:

```bash
mkdir -p /tmp/social-smoke/pages
cp assets/templates/social/cover/post-4-5.html /tmp/social-smoke/pages/01.html
bun run scripts/render-pdf.ts /tmp/social-smoke/pages --format social --output /tmp/social-smoke/rendered
bun run scripts/generate-manifest.ts /tmp/social-smoke/rendered --format post-4-5 --theme dark-editorial --archetype cover
bun run scripts/generate-preview.ts /tmp/social-smoke/rendered
open /tmp/social-smoke/rendered/preview.html
```

Expected: a visible, well-designed cover post renders at 2160×2700 (2x scale), manifest.yaml is well-formed, preview.html opens in the browser showing the PNG with metadata.

- [ ] **Merge back to main**

```bash
git checkout main
git merge --no-ff feat/social-format
```

Expected: fast-forward or no-conflict merge. Commit if interactive.

---

## Follow-up plan

After this plan lands, write `docs/superpowers/plans/2026-04-20-pdf-forge-instagram-archetype-library.md` covering the remaining 9 archetypes × 5 formats: mega-stat, steps, quote, before-after, definition, checklist, cta, photo-overlay, bento. Structure per archetype: one task creating all five format variants + `NOTES.md` + an integration test modeled on Task 14.
