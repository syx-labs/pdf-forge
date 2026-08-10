import { describe, expect, test, afterEach } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { makePng } from "../helpers/make-png";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const CLI = join(REPO_ROOT, "bin/pdf-forge.ts");
const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function runCli(
  args: string[],
  cwd = REPO_ROOT
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", CLI, ...args], {
    cwd,
    env: { ...process.env, PDF_FORGE_HOME: REPO_ROOT },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("pdf-forge stable CLI", () => {
  test("documents the engine commands and rejects unknown commands", async () => {
    const help = await runCli(["--help"]);
    expect(help.exitCode).toBe(0);
    for (const command of [
      "setup-browser",
      "render",
      "merge",
      "pptx",
      "gen-images",
      "mermaid",
      "manifest",
      "preview",
    ]) {
      expect(help.stdout).toContain(command);
    }

    const unknown = await runCli(["not-a-command"]);
    expect(unknown.exitCode).toBe(2);
    expect(unknown.stderr).toContain('Unknown command "not-a-command"');
  });

  test("routes optional engine commands without depending on the caller cwd", async () => {
    const cwd = await makeTempDir("pdf-forge-cli-cwd-");

    const pptx = await runCli(["pptx", "--help"], cwd);
    expect(pptx.exitCode).toBe(0);
    expect(pptx.stdout).toContain("Usage:");

    const images = await runCli(["gen-images", "--help"], cwd);
    expect(images.exitCode).toBe(0);
    expect(images.stdout).toContain("Usage:");

    const mermaid = await runCli(["mermaid"], cwd);
    expect(mermaid.exitCode).toBe(2);
    expect(mermaid.stderr).toContain("usage: prerender-mermaid.ts");
  });

  test("merges a PNG into a valid one-page PDF from an external cwd", async () => {
    const cwd = await makeTempDir("pdf-forge-cli-merge-");
    const rendered = join(cwd, "rendered");
    const output = join(cwd, "output.pdf");
    await mkdir(rendered);
    await writeFile(join(rendered, "01.png"), makePng(160, 90));

    const result = await runCli(["merge", rendered, "--output", output], cwd);
    expect(result.exitCode).toBe(0);

    const bytes = await readFile(output);
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  test("the skill invokes the CLI instead of skill-local engine scripts", async () => {
    const skill = await readFile(join(REPO_ROOT, "skills/pdf-forge/SKILL.md"), "utf-8");
    expect(skill).toContain('$PDF_FORGE_SKILL_DIR/bin/pdf-forge');
    expect(skill).not.toContain('$PDF_FORGE_HOME/bin/pdf-forge.ts');
    expect(skill).not.toContain("skills/pdf-forge/scripts/");
    expect(skill).not.toMatch(/\$PDF_FORGE_HOME\/scripts\/[^`"\s]+\.ts/);
  });
});
