import { afterEach, describe, expect, test } from "bun:test";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { makePng } from "../helpers/make-png";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function run(
  command: string[],
  cwd: string,
  env: Record<string, string | undefined> = process.env
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(command, { cwd, env, stdout: "pipe", stderr: "pipe" });
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

describe("pdf-forge checkout and skill location", () => {
  test("source CLI discovers an exact package root when its physical path contains dist", async () => {
    const temp = await makeTempDir("pdf-forge-distributed-source-");
    const checkout = join(temp, "distributed-source");
    await mkdir(checkout);
    await cp(join(REPO_ROOT, "package.json"), join(checkout, "package.json"));
    await cp(join(REPO_ROOT, "bin"), join(checkout, "bin"), { recursive: true });
    await symlink(join(REPO_ROOT, "src"), join(checkout, "src"), "dir");
    await symlink(join(REPO_ROOT, "scripts"), join(checkout, "scripts"), "dir");
    await symlink(join(REPO_ROOT, "skills"), join(checkout, "skills"), "dir");
    await symlink(join(REPO_ROOT, "node_modules"), join(checkout, "node_modules"), "dir");

    const rendered = join(temp, "rendered");
    const output = join(temp, "output.pdf");
    await mkdir(rendered);
    await writeFile(join(rendered, "01.png"), makePng(160, 90));

    const result = await run(
      [
        process.execPath,
        "run",
        join(checkout, "bin/pdf-forge.ts"),
        "merge",
        rendered,
        "--output",
        output,
      ],
      temp
    );
    expect(result.exitCode, result.stderr).toBe(0);
    const pdf = await PDFDocument.load(await readFile(output));
    expect(pdf.getPageCount()).toBe(1);
  });

  test("symlinked skill wrapper finds its active release with clean or stale env", async () => {
    const temp = await makeTempDir("pdf-forge-skill-link-");
    const installedSkill = join(temp, "installed-pdf-forge");
    await symlink(join(REPO_ROOT, "skills/pdf-forge"), installedSkill, "dir");
    const wrapper = join(installedSkill, "bin/pdf-forge");
    expect((await lstat(wrapper)).isFile()).toBe(true);

    const clean = await run([wrapper, "--help"], temp, {
      ...process.env,
      PDF_FORGE_HOME: undefined,
    });
    expect(clean.exitCode, clean.stderr).toBe(0);
    expect(clean.stdout).toContain("pdf-forge - HTML/Tailwind rendering pipeline");

    const staleRoot = join(temp, "stale-root");
    const staleMarker = join(temp, "stale-executed");
    await mkdir(join(staleRoot, "bin"), { recursive: true });
    await writeFile(
      join(staleRoot, "package.json"),
      JSON.stringify({ name: "pdf-forge-mcp" })
    );
    await writeFile(
      join(staleRoot, "bin/pdf-forge.ts"),
      `await Bun.write(${JSON.stringify(staleMarker)}, "wrong");`
    );

    const stale = await run([wrapper, "--help"], temp, {
      ...process.env,
      PDF_FORGE_HOME: staleRoot,
    });
    expect(stale.exitCode, stale.stderr).toBe(0);
    expect(stale.stdout).toContain("pdf-forge - HTML/Tailwind rendering pipeline");
    expect(stale.stderr).toContain("Ignoring stale PDF_FORGE_HOME");
    expect(await Bun.file(staleMarker).exists()).toBe(false);
  });
});
