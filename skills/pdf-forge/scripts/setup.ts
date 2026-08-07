#!/usr/bin/env bun
import { $ } from "bun";

const root = import.meta.dir.replace(/\/scripts$/, "");
process.chdir(root);

console.log("Installing pdf-forge dependencies...");
await $`bun install`;
console.log("Installing Playwright Chromium...");
await $`bunx playwright install chromium`;
console.log("Setup complete.");
