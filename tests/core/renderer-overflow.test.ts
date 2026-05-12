import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPages } from "../../src/core/renderer";

const slideHtml = (body: string) => `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="m-0 p-0 bg-zinc-950 text-white">
<div class="w-[1920px] h-[1080px]">${body}</div>
</body></html>`;

let tempDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "render-overflow-"));
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("renderPages overflow guard", () => {
  test("throws when slide content exceeds 1080px viewport", async () => {
    const input = join(tempDir, "slide-overflow");
    const output = join(tempDir, "out-slide-overflow");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      slideHtml(`<div style="height: 2000px; width: 1920px;">tall content</div>`)
    );
    await expect(
      renderPages({
        inputDir: input,
        outputDir: output,
        format: "slides",
        scale: 1,
      })
    ).rejects.toThrow(/overflow.*1920.*1080|Slides have a fixed/i);
  }, 30_000);

  test("allowOverflow: true bypasses guard for slides", async () => {
    const input = join(tempDir, "slide-allow");
    const output = join(tempDir, "out-slide-allow");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      slideHtml(`<div style="height: 2000px; width: 1920px;">tall content</div>`)
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "slides",
      scale: 1,
      allowOverflow: true,
    });
    expect(result.files).toHaveLength(1);
    const s = await stat(result.files[0]);
    expect(s.size).toBeGreaterThan(0);
  }, 30_000);

  test("allowOverflow: true bypasses guard for social", async () => {
    const input = join(tempDir, "social-allow");
    const output = join(tempDir, "out-social-allow");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
       <body data-social-format="post-1-1" class="m-0 p-0 bg-zinc-950 text-white">
         <div style="height: 2000px; width: 1080px;">overflows</div>
       </body></html>`
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "social",
      scale: 1,
      allowOverflow: true,
    });
    expect(result.files).toHaveLength(1);
  }, 30_000);

  test("docs are exempt from overflow guard (page.pdf paginates natively)", async () => {
    // A multi-page document with > 1123px content (A4 height) must NOT throw —
    // page.pdf handles pagination, so scrollHeight > viewport is expected.
    const input = join(tempDir, "doc-multipage");
    const output = join(tempDir, "out-doc-multipage");
    await mkdir(input, { recursive: true });
    await writeFile(
      join(input, "01.html"),
      `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head>
       <body class="m-0 p-0 bg-white text-zinc-900">
         <div class="w-[210mm]" style="height: 3000px;">spans 3 pages</div>
       </body></html>`
    );
    const result = await renderPages({
      inputDir: input,
      outputDir: output,
      format: "docs",
      scale: 1,
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEndWith(".pdf");
  }, 30_000);
});
