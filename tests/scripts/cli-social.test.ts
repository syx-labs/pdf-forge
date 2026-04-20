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
