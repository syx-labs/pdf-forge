# pdf-forge Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pdf-forge publicly installable on Claude Code (via marketplace), Claude Desktop, and Claude Web (via MCP server distributed on npm).

**Architecture:** Monorepo unificado. Extrair core de render/merge/setup dos scripts existentes para `src/core/` com APIs Node-compativel. Criar MCP server em `src/mcp/` que expoe `generate_pdf` tool + design system resources. CLI em `bin/` para setup automatizado do Claude Desktop. Build com `tsup` para npm, `tsc` para type-check.

**Tech Stack:** TypeScript, Bun (dev/plugin), Node (npm/MCP), Playwright, pdf-lib, @modelcontextprotocol/sdk, zod, tsup

**Nota sobre a spec:** A spec definia `pages` como `Array<{layout, content}>` com substituicao de template. O plano simplifica para `pages: string[]` (HTML completo). O LLM consulta os MCP resources (design system, templates) e gera HTML diretamente, espelhando como o skill do Claude Code funciona. Substituicao de template pode ser adicionada em v2 sem breaking changes.

---

### Task 1: Project Infrastructure

**Files:**
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "noEmit": true
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Install dependencies**

```bash
bun add @modelcontextprotocol/sdk zod
bun add -d tsup typescript @types/node
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/mcp/server.ts", "bin/pdf-forge.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  outDir: "dist",
  splitting: true,
  banner: { js: "#!/usr/bin/env node" },
});
```

- [ ] **Step 4: Update package.json**

Add these fields to the existing package.json (keep existing `dependencies`):

```json
{
  "name": "pdf-forge-mcp",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "description": "Professional PDF generation with Tailwind CSS. Anti-AI-sloppy slides and documents.",
  "author": { "name": "Gabriel Falcao" },
  "license": "MIT",
  "keywords": ["pdf", "slides", "presentation", "tailwind", "design", "documents", "mcp", "claude"],
  "bin": {
    "pdf-forge": "./dist/pdf-forge.js",
    "pdf-forge-mcp": "./dist/server.js"
  },
  "files": ["dist/", "assets/", "skills/", ".claude-plugin/"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "prepublishOnly": "bun run build"
  },
  "dependencies": {
    "playwright": "^1.50.0",
    "pdf-lib": "^1.17.1",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.4.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 5: Update .gitignore**

Append to existing `.gitignore`:

```
dist/
```

- [ ] **Step 6: Verify type-check passes**

Run: `bun run typecheck`
Expected: No errors (no src/ files yet, just config validation)

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json tsup.config.ts package.json .gitignore bun.lock
git commit -m "chore: add build infrastructure for npm distribution"
```

---

### Task 2: Core Types and Utilities

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/utils.ts`
- Create: `tests/core/utils.test.ts`

- [ ] **Step 1: Write tests for utility functions**

```typescript
// tests/core/utils.test.ts
import { describe, test, expect } from "bun:test";
import { formatFileSize } from "../../src/core/utils";

describe("formatFileSize", () => {
  test("formats bytes", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  test("formats kilobytes", () => {
    expect(formatFileSize(2048)).toBe("2.0 KB");
  });

  test("formats megabytes", () => {
    expect(formatFileSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/core/utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/core/types.ts**

```typescript
export type Format = "slides" | "docs";

export interface RenderOptions {
  inputDir: string;
  outputDir: string;
  format?: Format;
  scale?: number;
}

export interface RenderResult {
  files: string[];
  format: Format;
}

export interface MergeOptions {
  inputDir: string;
  outputPath: string;
}

export interface MergeResult {
  path: string;
  pageCount: number;
  fileSize: string;
}

export interface SetupOptions {
  pluginRoot: string;
}
```

- [ ] **Step 4: Create src/core/utils.ts**

```typescript
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type { Format } from "./types.js";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getHtmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => join(dir, f));
}

export async function detectFormat(htmlFiles: string[]): Promise<Format> {
  if (htmlFiles.length === 0) {
    throw new Error("No HTML files found in the input directory.");
  }
  const content = await readFile(htmlFiles[0], "utf-8");
  if (content.includes("w-[1920px]")) return "slides";
  if (content.includes("w-[210mm]")) return "docs";
  throw new Error(
    "Could not auto-detect format from first HTML file. Use --format to specify."
  );
}

export async function detectInputFormat(dir: string): Promise<{
  format: "png" | "pdf";
  files: string[];
}> {
  const entries = await readdir(dir);
  const pngs = entries
    .filter((f) => extname(f).toLowerCase() === ".png")
    .sort();
  const pdfs = entries
    .filter((f) => extname(f).toLowerCase() === ".pdf")
    .sort();

  if (pngs.length > 0)
    return { format: "png", files: pngs.map((f) => join(dir, f)) };
  if (pdfs.length > 0)
    return { format: "pdf", files: pdfs.map((f) => join(dir, f)) };
  throw new Error("No PNG or PDF files found in the input directory.");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/core/utils.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/utils.ts tests/core/utils.test.ts
git commit -m "feat: add core types and utility functions"
```

---

### Task 3: Core Renderer

**Files:**
- Create: `src/core/renderer.ts`
- Create: `tests/core/renderer.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/core/renderer.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderPages } from "../../src/core/renderer";

let tempDir: string;
let inputDir: string;
let outputDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-test-"));
  inputDir = join(tempDir, "input");
  outputDir = join(tempDir, "output");
  await Bun.write(
    join(inputDir, "01-test.html"),
    `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
</head><body class="m-0 p-0 bg-zinc-950">
<div class="w-[1920px] h-[1080px] bg-zinc-950 flex items-center justify-center">
<h1 class="text-7xl text-white font-bold">Test</h1>
</div></body></html>`
  );
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("renderPages", () => {
  test("renders a slide HTML to PNG", async () => {
    const result = await renderPages({
      inputDir,
      outputDir,
      format: "slides",
      scale: 1,
    });
    expect(result.format).toBe("slides");
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEndWith(".png");

    const file = Bun.file(result.files[0]);
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeGreaterThan(0);
  }, 30_000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/renderer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/core/renderer.ts**

```typescript
import { readFile, mkdir, stat as fsStat } from "node:fs/promises";
import { join, basename } from "node:path";
import type { Format, RenderOptions, RenderResult } from "./types.js";
import { getHtmlFiles, detectFormat } from "./utils.js";

export async function renderPages(options: RenderOptions): Promise<RenderResult> {
  const { inputDir, outputDir, scale = 2 } = options;

  const s = await fsStat(inputDir);
  if (!s.isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  const htmlFiles = await getHtmlFiles(inputDir);
  if (htmlFiles.length === 0) {
    throw new Error("No .html files found in the input directory.");
  }

  const format: Format = options.format ?? (await detectFormat(htmlFiles));
  await mkdir(outputDir, { recursive: true });

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport:
      format === "slides"
        ? { width: 1920, height: 1080 }
        : { width: 794, height: 1123 },
    deviceScaleFactor: scale,
  });

  const outputFiles: string[] = [];

  try {
    for (const filePath of htmlFiles) {
      const name = basename(filePath);
      const page = await context.newPage();

      await page.goto(`file://${filePath}`, { waitUntil: "load" });

      // Wait for Tailwind CDN to inject styles
      await page.waitForFunction(
        () => {
          const styles = document.querySelectorAll("style");
          return Array.from(styles).some((s) =>
            s.textContent?.includes("--tw-")
          );
        },
        { timeout: 10_000 }
      );

      // Wait for fonts to load
      await page.evaluate(() => document.fonts.ready);

      if (format === "slides") {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".png"));
        await page.screenshot({
          path: outputPath,
          fullPage: true,
          type: "png",
        });
        outputFiles.push(outputPath);
      } else {
        const outputPath = join(outputDir, name.replace(/\.html$/, ".pdf"));
        await page.pdf({
          path: outputPath,
          format: "A4",
          printBackground: true,
          margin: { top: "0", right: "0", bottom: "0", left: "0" },
        });
        outputFiles.push(outputPath);
      }

      await page.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  return { files: outputFiles, format };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/renderer.test.ts --timeout 30000`
Expected: PASS (requires Playwright + Chromium installed via `bun run scripts/setup.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/core/renderer.ts tests/core/renderer.test.ts
git commit -m "feat: extract core renderer from scripts/render-pdf.ts"
```

---

### Task 4: Core Merger

**Files:**
- Create: `src/core/merger.ts`
- Create: `tests/core/merger.test.ts`

- [ ] **Step 1: Write test**

```typescript
// tests/core/merger.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PDFDocument } from "pdf-lib";
import { mergePages } from "../../src/core/merger";

let tempDir: string;
let inputDir: string;

beforeAll(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-merge-test-"));
  inputDir = join(tempDir, "input");

  // Create two minimal single-page PDFs
  for (const name of ["01-page.pdf", "02-page.pdf"]) {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]); // A4 in points
    const bytes = await doc.save();
    await Bun.write(join(inputDir, name), bytes);
  }
});

afterAll(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("mergePages", () => {
  test("merges two PDFs into one", async () => {
    const outputPath = join(tempDir, "merged.pdf");
    const result = await mergePages({ inputDir, outputPath });

    expect(result.pageCount).toBe(2);
    expect(result.path).toBe(outputPath);
    expect(result.fileSize).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);

    // Verify the merged PDF has 2 pages
    const bytes = await Bun.file(outputPath).arrayBuffer();
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/core/merger.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/core/merger.ts**

```typescript
import { readdir, stat as fsStat, readFile, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { PDFDocument } from "pdf-lib";
import type { MergeOptions, MergeResult } from "./types.js";
import { detectInputFormat, formatFileSize } from "./utils.js";

const SLIDE_WIDTH = 1440;
const SLIDE_HEIGHT = 810;

async function mergePngs(
  files: string[],
  outputPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();

  for (const filePath of files) {
    const imageBytes = await readFile(filePath);
    const pngImage = await pdfDoc.embedPng(imageBytes);
    const page = pdfDoc.addPage([SLIDE_WIDTH, SLIDE_HEIGHT]);
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    });
  }

  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, pdfBytes);
}

async function mergePdfs(
  files: string[],
  outputPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();

  for (const filePath of files) {
    const bytes = await readFile(filePath);
    const srcDoc = await PDFDocument.load(bytes);
    const copiedPages = await pdfDoc.copyPages(
      srcDoc,
      srcDoc.getPageIndices()
    );
    for (const page of copiedPages) {
      pdfDoc.addPage(page);
    }
  }

  const pdfBytes = await pdfDoc.save();
  await writeFile(outputPath, pdfBytes);
}

export async function mergePages(options: MergeOptions): Promise<MergeResult> {
  const { inputDir, outputPath } = options;

  const s = await fsStat(inputDir);
  if (!s.isDirectory()) {
    throw new Error(`"${inputDir}" is not a directory.`);
  }

  const { format, files } = await detectInputFormat(inputDir);

  if (format === "png") {
    await mergePngs(files, outputPath);
  } else {
    await mergePdfs(files, outputPath);
  }

  const outputStat = await fsStat(outputPath);
  return {
    path: outputPath,
    pageCount: files.length,
    fileSize: formatFileSize(outputStat.size),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/core/merger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/merger.ts tests/core/merger.test.ts
git commit -m "feat: extract core merger from scripts/merge-pages.ts"
```

---

### Task 5: Core Setup and Rewrite CLI Scripts

**Files:**
- Create: `src/core/setup.ts`
- Modify: `scripts/render-pdf.ts`
- Modify: `scripts/merge-pages.ts`
- Modify: `scripts/setup.ts`

- [ ] **Step 1: Create src/core/setup.ts**

```typescript
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

export async function setupDependencies(options: SetupOptions): Promise<void> {
  const { pluginRoot } = options;

  // Check and install missing deps
  const missing: string[] = [];
  try { await import("playwright"); } catch { missing.push("playwright"); }
  try { await import("pdf-lib"); } catch { missing.push("pdf-lib"); }

  if (missing.length > 0) {
    console.log(`Installing: ${missing.join(", ")}...`);
    await run(["bun", "add", ...missing], pluginRoot);
  }

  // Install Chromium browser
  console.log("Installing Chromium browser for Playwright...");
  await run(["bunx", "playwright", "install", "chromium"], pluginRoot);
  console.log("Setup complete.");
}
```

- [ ] **Step 2: Rewrite scripts/render-pdf.ts as a thin wrapper**

Replace the entire content of `scripts/render-pdf.ts`:

```typescript
/**
 * render-pdf.ts — CLI wrapper for core renderer
 *
 * Usage:
 *   bun run scripts/render-pdf.ts <input-dir> [--format slides|docs] [--output <dir>] [--scale 2]
 */

import { resolve } from "node:path";
import { renderPages } from "../src/core/renderer";
import type { Format } from "../src/core/types";

const args = process.argv.slice(2);
let inputDir = "";
let format: Format | undefined;
let outputDir = "./output";
let scale = 2;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--format") {
    const val = args[++i];
    if (val !== "slides" && val !== "docs") {
      console.error(`Invalid format "${val}". Use "slides" or "docs".`);
      process.exit(1);
    }
    format = val;
  } else if (arg === "--output") {
    outputDir = args[++i];
    if (!outputDir) { console.error("Missing value for --output."); process.exit(1); }
  } else if (arg === "--scale") {
    scale = parseInt(args[++i], 10);
    if (isNaN(scale) || scale < 1 || scale > 4) {
      console.error("Scale must be 1-4. Default: 2.");
      process.exit(1);
    }
  } else if (!arg.startsWith("--")) {
    inputDir = arg;
  }
}

if (!inputDir) {
  console.error("Usage: bun run scripts/render-pdf.ts <input-dir> [--format slides|docs] [--output <dir>] [--scale 2]");
  process.exit(1);
}

try {
  const result = await renderPages({
    inputDir: resolve(inputDir),
    outputDir: resolve(outputDir),
    format,
    scale,
  });
  console.log(`\nRendered ${result.files.length} ${result.format} files to ${resolve(outputDir)}`);
} catch (err) {
  console.error("Render error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
```

- [ ] **Step 3: Rewrite scripts/merge-pages.ts as a thin wrapper**

Replace the entire content of `scripts/merge-pages.ts`:

```typescript
/**
 * merge-pages.ts — CLI wrapper for core merger
 *
 * Usage:
 *   bun run scripts/merge-pages.ts <input-dir> [--output output.pdf]
 */

import { resolve } from "node:path";
import { mergePages } from "../src/core/merger";

const args = process.argv.slice(2);
let inputDir = "";
let outputPath = "./output.pdf";

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output") {
    outputPath = args[++i];
    if (!outputPath) { console.error("Missing value for --output."); process.exit(1); }
  } else if (!arg.startsWith("--")) {
    inputDir = arg;
  }
}

if (!inputDir) {
  console.error("Usage: bun run scripts/merge-pages.ts <input-dir> [--output output.pdf]");
  process.exit(1);
}

try {
  const result = await mergePages({
    inputDir: resolve(inputDir),
    outputPath: resolve(outputPath),
  });
  console.log(`\nDone. Output: ${result.path} (${result.fileSize})`);
} catch (err) {
  console.error("Merge error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
```

- [ ] **Step 4: Rewrite scripts/setup.ts as a thin wrapper**

Replace the entire content of `scripts/setup.ts`:

```typescript
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
```

- [ ] **Step 5: Smoke test — verify scripts still work**

Run: `bun run scripts/setup.ts`
Expected: "Setup complete." (or "Dependencies already installed" + Chromium check)

Run: `bun run scripts/render-pdf.ts assets/templates/slides/ --output /tmp/pdf-forge-smoke --scale 1`
Expected: Renders 8 slide templates to PNGs in `/tmp/pdf-forge-smoke/`

Run: `bun run scripts/merge-pages.ts /tmp/pdf-forge-smoke/ --output /tmp/pdf-forge-smoke.pdf`
Expected: Merges PNGs into a single PDF

- [ ] **Step 6: Commit**

```bash
git add src/core/setup.ts scripts/render-pdf.ts scripts/merge-pages.ts scripts/setup.ts
git commit -m "refactor: extract core modules and rewrite scripts as thin wrappers"
```

---

### Task 6: MCP Server — Resources and Tool

**Files:**
- Create: `src/mcp/server.ts`
- Create: `tests/mcp/server.test.ts`

- [ ] **Step 1: Write test for MCP server**

```typescript
// tests/mcp/server.test.ts
import { describe, test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server";

describe("MCP Server", () => {
  test("lists resources", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);

    expect(uris).toContain("pdf-forge://design-system");
    expect(uris).toContain("pdf-forge://templates/slides");
    expect(uris).toContain("pdf-forge://templates/docs");
    expect(uris).toContain("pdf-forge://color-palettes");
    expect(uris).toContain("pdf-forge://anti-patterns");

    await client.close();
    await server.close();
  });

  test("reads a resource", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const result = await client.readResource({ uri: "pdf-forge://design-system" });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Typography");

    await client.close();
    await server.close();
  });

  test("lists generate_pdf tool", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("generate_pdf");

    await client.close();
    await server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/mcp/server.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create src/mcp/server.ts**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { resolve, join, dirname } from "node:path";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { renderPages } from "../core/renderer.js";
import { mergePages } from "../core/merger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "../..");

const RESOURCE_MAP: Record<string, string> = {
  "pdf-forge://design-system":
    "skills/pdf-forge/references/design-system.md",
  "pdf-forge://templates/slides":
    "skills/pdf-forge/references/slide-layouts.md",
  "pdf-forge://templates/docs":
    "skills/pdf-forge/references/doc-layouts.md",
  "pdf-forge://color-palettes":
    "skills/pdf-forge/references/color-palettes.md",
  "pdf-forge://anti-patterns":
    "skills/pdf-forge/references/anti-patterns.md",
};

export function createServer(): McpServer {
  const server = new McpServer({
    name: "pdf-forge",
    version: "0.1.0",
  });

  // Register resources
  for (const [uri, filePath] of Object.entries(RESOURCE_MAP)) {
    const name = uri.replace("pdf-forge://", "");
    server.resource(name, uri, async () => {
      const content = await readFile(join(PLUGIN_ROOT, filePath), "utf-8");
      return {
        contents: [{ uri, text: content, mimeType: "text/markdown" }],
      };
    });
  }

  // Register tool
  server.tool(
    "generate_pdf",
    {
      format: z
        .enum(["slides", "docs"])
        .describe("Output format: 'slides' for 16:9 presentations, 'docs' for A4 documents"),
      pages: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of complete, self-contained HTML strings. Each string is one page/slide. " +
          "Read the pdf-forge://design-system and pdf-forge://templates/* resources for guidance."
        ),
      outputPath: z
        .string()
        .optional()
        .describe("Output PDF path. Default: ./output.pdf"),
      scale: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe("Render scale factor. Default: 2 (HiDPI). Use 3 for print quality."),
    },
    async ({ format, pages, outputPath, scale }) => {
      // Write HTML pages to temp directory
      const tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-"));

      for (let i = 0; i < pages.length; i++) {
        const filename = `${String(i + 1).padStart(2, "0")}-page.html`;
        await writeFile(join(tempDir, filename), pages[i], "utf-8");
      }

      // Render HTML to images/PDFs
      const renderDir = join(tempDir, "rendered");
      await renderPages({
        inputDir: tempDir,
        outputDir: renderDir,
        format,
        scale,
      });

      // Merge into final PDF
      const finalPath = resolve(outputPath ?? "./output.pdf");
      const result = await mergePages({
        inputDir: renderDir,
        outputPath: finalPath,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              path: result.path,
              pageCount: result.pageCount,
              fileSize: result.fileSize,
            }),
          },
        ],
      };
    }
  );

  return server;
}

// Start server when run directly (not imported)
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.js"));

if (isMain) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/mcp/server.test.ts`
Expected: PASS (resource listing and reading should work; tool listing should work)

Note: if `InMemoryTransport` is not available in the SDK version, adjust to use `StreamTransport` or mock the transport layer. Check the SDK docs for the correct test utilities.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server.test.ts
git commit -m "feat: add MCP server with generate_pdf tool and design system resources"
```

---

### Task 7: CLI Entrypoint

**Files:**
- Create: `bin/pdf-forge.ts`

- [ ] **Step 1: Create bin/pdf-forge.ts**

```typescript
#!/usr/bin/env node

import { resolve, join, dirname } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { fileURLToPath } from "node:url";
import { setupDependencies } from "../src/core/setup.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, "..");

function getConfigPath(): string {
  const home = homedir();
  const os = platform();
  if (os === "darwin") {
    return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  } else if (os === "win32") {
    return join(
      process.env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Claude",
      "claude_desktop_config.json"
    );
  }
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

async function setup() {
  console.log("pdf-forge setup\n");

  // 1. Install dependencies
  console.log("Step 1/2: Installing dependencies...");
  await setupDependencies({ pluginRoot: PLUGIN_ROOT });

  // 2. Configure Claude Desktop
  console.log("\nStep 2/2: Configuring Claude Desktop...");
  const configPath = getConfigPath();
  let config: Record<string, unknown> = {};

  try {
    const raw = await readFile(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    // File doesn't exist or is invalid — start fresh
    const configDir = dirname(configPath);
    await mkdir(configDir, { recursive: true });
  }

  const mcpServers = (config.mcpServers ?? {}) as Record<string, unknown>;

  if (mcpServers["pdf-forge"]) {
    console.log("pdf-forge already configured in Claude Desktop.");
    console.log(`Config: ${configPath}`);
    return;
  }

  mcpServers["pdf-forge"] = {
    command: "npx",
    args: ["pdf-forge-mcp"],
  };
  config.mcpServers = mcpServers;

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  console.log(`\nClaude Desktop configured: ${configPath}`);
  console.log("Restart Claude Desktop to activate pdf-forge.");
}

const command = process.argv[2];

if (command === "setup") {
  try {
    await setup();
  } catch (err) {
    console.error("Setup failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
} else {
  console.log("pdf-forge - Professional PDF generation\n");
  console.log("Usage:");
  console.log("  npx pdf-forge setup    Install dependencies and configure Claude Desktop");
  console.log("  npx pdf-forge-mcp      Start the MCP server (used by Claude Desktop)");
}
```

- [ ] **Step 2: Verify CLI runs**

Run: `bun bin/pdf-forge.ts`
Expected: Shows usage instructions

Run: `bun bin/pdf-forge.ts setup`
Expected: Installs deps, configures Claude Desktop config (creates/updates the JSON file)

- [ ] **Step 3: Commit**

```bash
git add bin/pdf-forge.ts
git commit -m "feat: add CLI entrypoint for npx pdf-forge setup"
```

---

### Task 8: Marketplace Configuration

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Modify: `.claude-plugin/plugin.json`

- [ ] **Step 1: Update plugin.json with distribution metadata**

Replace `.claude-plugin/plugin.json`:

```json
{
  "name": "pdf-forge",
  "version": "0.1.0",
  "description": "Professional PDF generation with Tailwind CSS. Anti-AI-sloppy slides and documents.",
  "author": {
    "name": "Gabriel Falcao",
    "url": "https://github.com/syx-labs"
  },
  "license": "MIT",
  "homepage": "https://github.com/syx-labs/pdf-forge",
  "repository": "https://github.com/syx-labs/pdf-forge",
  "keywords": ["pdf", "slides", "presentation", "tailwind", "design", "documents"]
}
```

- [ ] **Step 2: Create marketplace.json**

```json
{
  "name": "syx-labs-plugins",
  "plugins": [
    {
      "name": "pdf-forge",
      "source": ".",
      "description": "Professional PDF generation with Tailwind CSS. Slides and documents with Vercel/Stripe-quality aesthetics."
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "feat: add marketplace configuration for plugin distribution"
```

---

### Task 9: CI/CD and Final Wiring

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`
- Modify: `README.md` (add installation sections)

- [ ] **Step 1: Create CI workflow**

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Unit tests
        run: bun test tests/core/utils.test.ts

      - name: Build
        run: bun run build

  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - run: bun install

      - name: Install Playwright
        run: bunx playwright install chromium --with-deps

      - name: Integration tests
        run: bun test tests/ --timeout 60000
```

- [ ] **Step 2: Create publish workflow**

```yaml
# .github/workflows/publish.yml
name: Publish

on:
  push:
    tags: ["v*"]

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org

      - run: bun install

      - name: Build
        run: bun run build

      - name: Publish to npm
        run: npm publish --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

- [ ] **Step 3: Update README.md with installation instructions**

Add the following sections to the existing README.md, after the "## Installation" section. Replace the current installation section:

```markdown
## Installation

### Claude Code (plugin)

Add the marketplace and install:

```bash
# Add marketplace
/plugin marketplace add syx-labs/pdf-forge

# Install
/plugin install pdf-forge@syx-labs-plugins
```

Or if available on the official marketplace:

```bash
/plugin install pdf-forge@claude-plugins-official
```

### Claude Desktop (MCP server)

One command sets up everything — installs Playwright/Chromium and configures Claude Desktop:

```bash
npx pdf-forge setup
```

Then restart Claude Desktop. The pdf-forge tool and design system resources will be available.

### Development

```bash
git clone https://github.com/syx-labs/pdf-forge.git
cd pdf-forge
bun install
bun run scripts/setup.ts
```
```

- [ ] **Step 4: Run full test suite**

Run: `bun test`
Expected: All tests pass

Run: `bun run build`
Expected: `dist/` directory created with `server.js` and `pdf-forge.js`

Run: `bun run typecheck`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/publish.yml README.md
git commit -m "feat: add CI/CD workflows and update installation docs"
```

- [ ] **Step 6: Verify build output works**

Run: `node dist/pdf-forge.js`
Expected: Shows usage instructions (validates Node compatibility)

Run: `node dist/server.js &` then send a JSON-RPC `initialize` message to verify MCP server starts.
Or: simply check the process starts without errors and listens on stdin.

- [ ] **Step 7: Final commit tag**

```bash
git tag v0.1.0
```

Do NOT push the tag — that triggers npm publish. Push only after verifying the npm token is configured.
