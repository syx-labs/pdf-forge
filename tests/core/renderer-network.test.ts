import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPages } from "../../src/core/renderer";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("renderPages network policy", () => {
  test("blocks HTTP egress for governed compositions", async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        requests += 1;
        return new Response("pixel", { headers: { "content-type": "image/png" } });
      },
    });
    const root = await mkdtemp(join(tmpdir(), "pdf-forge-network-policy-"));
    temporaryRoots.push(root);
    const inputDir = join(root, "input");
    const outputDir = join(root, "output");
    await mkdir(inputDir, { recursive: true });
    await writeFile(
      join(inputDir, "01-network.html"),
      `<!doctype html><html><head><style>:root { --tw-ready: 1; } body { background-image: url("${server.url}pixel.png"); }</style></head><body>blocked</body></html>`,
      "utf8"
    );

    try {
      const rendered = await renderPages({
        inputDir,
        outputDir,
        format: "docs",
        scale: 1,
        blockNetwork: true,
      });

      expect(rendered.files).toHaveLength(1);
      expect((await stat(rendered.files[0] ?? "")).size).toBeGreaterThan(0);
      expect(requests).toBe(0);
    } finally {
      server.stop(true);
    }
  }, 30_000);

  test("aborts in-flight browser work instead of waiting for the page timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "pdf-forge-render-abort-"));
    temporaryRoots.push(root);
    const inputDir = join(root, "input");
    const outputDir = join(root, "output");
    await mkdir(inputDir, { recursive: true });
    await writeFile(
      join(inputDir, "01-stalled.html"),
      "<!doctype html><html><head></head><body>never-ready</body></html>",
      "utf8"
    );
    const controller = new AbortController();
    const startedAt = Date.now();
    setTimeout(() => controller.abort(new Error("test cancellation")), 50);

    await expect(
      renderPages({
        inputDir,
        outputDir,
        format: "docs",
        scale: 1,
        signal: controller.signal,
      })
    ).rejects.toThrow();

    expect(Date.now() - startedAt).toBeLessThan(2_000);
    expect(
      await stat(join(outputDir, "01-stalled.pdf")).then(
        () => true,
        () => false
      )
    ).toBe(false);
  }, 10_000);
});
