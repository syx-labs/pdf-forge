import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { SetupOptions } from "./types.js";

function run(cmd: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), {
      stdio: "inherit",
      cwd,
    });
    proc.on("close", (code) => {
      if (code !== 0) reject(new Error(`Command failed (exit ${code}): ${cmd.join(" ")}`));
      else resolve();
    });
    proc.on("error", reject);
  });
}

function resolvePlaywrightCli(): string {
  const playwrightMain = import.meta.resolve("playwright");
  const playwrightDir = dirname(fileURLToPath(playwrightMain));
  return join(playwrightDir, "cli.js");
}

export async function setupDependencies(options: SetupOptions): Promise<void> {
  console.log("Installing Chromium browser for Playwright...");
  const cli = resolvePlaywrightCli();

  // Playwright's CLI warns when process.argv[1] contains "_npx" (isLikelyNpxGlobal check).
  // When installed via npx, the cli.js path lives under ~/.npm/_npx/..., triggering the warning.
  // We use a temp wrapper so process.argv[1] is a clean path.
  const tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-"));
  const wrapper = join(tempDir, "pw-install.js");
  await writeFile(wrapper, `require(${JSON.stringify(cli)});\n`);
  try {
    await run([process.execPath, wrapper, "install", "chromium"], options.pluginRoot);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
  console.log("Setup complete.");
}
