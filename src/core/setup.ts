import { spawn } from "node:child_process";
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

function detectPackageManager(): { install: string[]; exec: string[] } {
  if ("Bun" in globalThis) {
    return { install: ["bun", "add"], exec: ["bunx"] };
  }
  return { install: ["npm", "install"], exec: ["npx"] };
}

export async function setupDependencies(options: SetupOptions): Promise<void> {
  const { pluginRoot } = options;
  const pm = detectPackageManager();

  const missing: string[] = [];
  try { await import("playwright"); } catch { missing.push("playwright"); }
  try { await import("pdf-lib"); } catch { missing.push("pdf-lib"); }

  if (missing.length > 0) {
    console.log(`Installing: ${missing.join(", ")}...`);
    await run([...pm.install, ...missing], pluginRoot);
  }

  console.log("Installing Chromium browser for Playwright...");
  await run([...pm.exec, "playwright", "install", "chromium"], pluginRoot);
  console.log("Setup complete.");
}
