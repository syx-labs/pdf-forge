import { afterEach, describe, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dir, "../..");
const MERMAID = join(ROOT, "scripts/prerender-mermaid.ts");
const GEN_IMAGES = join(ROOT, "scripts/gen-images.ts");
const temporaryRoots: string[] = [];

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function run(
  command: readonly string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const process = Bun.spawn(command, {
    cwd,
    env: {
      HOME: globalThis.process.env.HOME ?? tmpdir(),
      PATH: globalThis.process.env.PATH ?? "",
      TMPDIR: globalThis.process.env.TMPDIR ?? tmpdir(),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(
    () => true,
    () => false
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("script manifest security boundaries", () => {
  test("rejects unsafe Mermaid font fields, diagram names, and sequence dictionaries before Chromium", async () => {
    const cases = [
      {
        name: "font-family-injection",
        manifest: `font:\n  family: "x';<script>alert(1)</script>"\n  url: "https://fonts.googleapis.com/css2?family=Inter"\ntheme_variables: {}\ndiagrams:\n  safe: "flowchart LR; A-->B"\n`,
      },
      {
        name: "untrusted-font-origin",
        manifest: `font:\n  family: "Inter"\n  url: "https://attacker.example/font.css"\ntheme_variables: {}\ndiagrams:\n  safe: "flowchart LR; A-->B"\n`,
      },
      {
        name: "diagram-traversal",
        manifest: `font:\n  family: "Inter"\n  url: "https://fonts.googleapis.com/css2?family=Inter"\ntheme_variables: {}\ndiagrams:\n  ../../outside: "flowchart LR; A-->B"\n`,
      },
      {
        name: "sequence-dictionary",
        manifest: `font:\n  family: "Inter"\n  url: "https://fonts.googleapis.com/css2?family=Inter"\ntheme_variables: ["#fff"]\ndiagrams:\n  safe: "flowchart LR; A-->B"\n`,
      },
    ] as const;

    for (const candidate of cases) {
      const root = await temporaryRoot(`pdf-forge-${candidate.name}-`);
      const manifestPath = join(root, "manifest.yaml");
      const output = join(root, "output");
      await writeFile(manifestPath, candidate.manifest, "utf8");

      const result = await run(
        [process.execPath, "run", MERMAID, manifestPath, "--output", output],
        root
      );

      expect(result.exitCode, candidate.name).toBe(2);
      expect(result.stdout, candidate.name).toBe("");
      expect(result.stderr, candidate.name).toContain("invalid manifest");
      expect(await exists(output), candidate.name).toBe(false);
    }
  });

  test("distinguishes an invalid image manifest from a valid empty image list", async () => {
    const root = await temporaryRoot("pdf-forge-gen-images-validation-");
    const project = join(root, "project");
    await mkdir(project);

    const invalidPath = join(root, "invalid.yaml");
    await writeFile(invalidPath, "images_dir: 42\nimages: []\n", "utf8");
    const invalid = await run(
      [process.execPath, "run", GEN_IMAGES, project, invalidPath],
      root
    );
    expect(invalid.exitCode).toBe(1);
    expect(invalid.stderr).toContain("has an invalid structure");
    expect(invalid.stderr).not.toContain("has no images[] array");

    const emptyPath = join(root, "empty.yaml");
    await writeFile(emptyPath, "images: []\n", "utf8");
    const empty = await run(
      [process.execPath, "run", GEN_IMAGES, project, emptyPath],
      root
    );
    expect(empty.exitCode).toBe(1);
    expect(empty.stderr).toContain("has no images[] array");
    expect(empty.stderr).not.toContain("has an invalid structure");
  });
});
