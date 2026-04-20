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

  test("throws explicit error when social content overflows viewport", async () => {
    const input = join(tempDir, "overflow");
    const output = join(tempDir, "out-overflow");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(input, { recursive: true });
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
});
