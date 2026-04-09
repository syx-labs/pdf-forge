/**
 * setup.ts — CLI wrapper for core setup
 *
 * Usage:
 *   bun run scripts/setup.ts
 */

import { resolve } from "node:path";
import { setupDependencies } from "../src/core/setup";

const pluginRoot = resolve(import.meta.dir, "..");

console.log("pdf-forge setup\n");

try {
  await setupDependencies({ pluginRoot });
} catch (err) {
  console.error("Setup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
