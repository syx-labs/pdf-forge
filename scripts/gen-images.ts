/**
 * gen-images.ts — Generate deck images in parallel via Codex `imagegen` skill.
 *
 * Reads a YAML manifest describing the desired images, then dispatches one
 * `codex exec` per slug, each one calling the imagegen skill with a composed
 * prompt (common_style + common_palette + per-image concept). Idempotent —
 * skips slugs whose output PNG already exists.
 *
 * Usage:
 *   bun run scripts/gen-images.ts <project-root> <manifest.yaml> [--concurrency 4]
 *
 * Manifest schema: see scripts/image-manifest.example.yaml.
 *
 * Requirements:
 *   - `codex` CLI on PATH with imagegen skill available
 *   - PROJECT_ROOT must be a real, sandbox-accessible directory
 */

import { resolve, dirname } from "node:path";
import { mkdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { load as yamlLoad } from "js-yaml";

interface ImageSpec {
  slug: string;
  concept: string;
  aspect?: string;
  dimensions?: string;
}

interface Manifest {
  images_dir?: string;
  log_dir?: string;
  default_aspect?: string;
  default_dimensions?: string;
  common_style?: string;
  common_palette?: string;
  asset_type?: string;
  use_case?: string;
  images: ImageSpec[];
}

const args = process.argv.slice(2);
let projectRoot = "";
let manifestPath = "";
let concurrency = 4;

const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--concurrency") {
    concurrency = parseInt(args[++i], 10);
    if (isNaN(concurrency) || concurrency < 1) {
      console.error("--concurrency must be a positive integer.");
      process.exit(1);
    }
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "Usage: bun run scripts/gen-images.ts <project-root> <manifest.yaml> [--concurrency 4]"
    );
    process.exit(0);
  } else if (!arg.startsWith("--")) {
    positional.push(arg);
  }
}

if (positional.length < 2) {
  console.error(
    "Usage: bun run scripts/gen-images.ts <project-root> <manifest.yaml> [--concurrency 4]"
  );
  process.exit(1);
}

projectRoot = resolve(positional[0]);
manifestPath = resolve(positional[1]);

const projStat = await stat(projectRoot).catch(() => null);
if (!projStat || !projStat.isDirectory()) {
  console.error(`Project root "${projectRoot}" is not a directory.`);
  process.exit(1);
}

const manifestRaw = await readFile(manifestPath, "utf-8");
const manifest = yamlLoad(manifestRaw) as Manifest;

if (!manifest || !Array.isArray(manifest.images) || manifest.images.length === 0) {
  console.error(`Manifest "${manifestPath}" has no images[] array.`);
  process.exit(1);
}

// slug becomes a filename — reject path separators, .., and other shell metacharacters.
// Allowed: lowercase/uppercase letters, digits, hyphen, underscore, dot.
const SLUG_PATTERN = /^[A-Za-z0-9._-]+$/;
for (const spec of manifest.images) {
  if (!spec || typeof spec.slug !== "string" || !SLUG_PATTERN.test(spec.slug) || spec.slug.startsWith(".")) {
    console.error(
      `Invalid slug "${spec?.slug}". Slugs must match /^[A-Za-z0-9._-]+$/ and not start with a dot (no path traversal).`
    );
    process.exit(1);
  }
}

const imagesDir = resolve(projectRoot, manifest.images_dir ?? "assets/images");
const logDir = resolve(projectRoot, manifest.log_dir ?? "scripts/logs");
const defaultAspect = manifest.default_aspect ?? "16:9";
const defaultDimensions = manifest.default_dimensions ?? "2048x1152";
const commonStyle = manifest.common_style ?? "";
const commonPalette = manifest.common_palette ?? "";
const assetType = manifest.asset_type ?? "card thumbnail for a deck";
const useCase = manifest.use_case ?? "stylized-concept";

await mkdir(imagesDir, { recursive: true });
await mkdir(logDir, { recursive: true });

function buildPrompt(spec: ImageSpec, outPath: string): string {
  const aspect = spec.aspect ?? defaultAspect;
  const dimensions = spec.dimensions ?? defaultDimensions;
  return `Use the imagegen skill with the built-in image_gen tool to create ONE ${aspect} image (${dimensions}) and SAVE it to ${outPath}

Spec:
Use case: ${useCase}
Asset type: ${assetType}
Primary request: ${spec.concept}
${commonStyle}
Color palette: ${commonPalette}

After generating, copy/move the output to ${outPath} and confirm the final saved path with sips dimensions.`;
}

async function runOne(spec: ImageSpec): Promise<"done" | "skipped" | "failed"> {
  const outPath = resolve(imagesDir, `${spec.slug}.png`);
  const logPath = resolve(logDir, `${spec.slug}.log`);

  const existing = await stat(outPath).catch(() => null);
  if (existing) {
    console.log(`[SKIP]  ${spec.slug} (already exists)`);
    return "skipped";
  }

  console.log(`[START] ${spec.slug}`);

  const prompt = buildPrompt(spec, outPath);

  const proc = spawn(
    "codex",
    [
      "exec",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "-s",
      "danger-full-access",
      "-C",
      projectRoot,
      prompt,
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const logHandle = Bun.file(logPath).writer();
  proc.stdout.on("data", (chunk) => logHandle.write(chunk));
  proc.stderr.on("data", (chunk) => logHandle.write(chunk));

  // Spawn errors (e.g. `codex` not on PATH) must not blow up the whole pool —
  // surface them as failed slugs and keep the rest of the manifest running.
  const exitInfo: { code: number; spawnError?: Error } = await new Promise((res) => {
    proc.on("close", (c) => res({ code: c ?? 1 }));
    proc.on("error", (err) => res({ code: 1, spawnError: err }));
  });
  await logHandle.end();

  if (exitInfo.spawnError) {
    console.log(
      `[FAIL]  ${spec.slug} (spawn error: ${exitInfo.spawnError.message}, see ${logPath})`
    );
    return "failed";
  }

  if (exitInfo.code !== 0) {
    console.log(`[FAIL]  ${spec.slug} (exit ${exitInfo.code}, see ${logPath})`);
    return "failed";
  }

  const produced = await stat(outPath).catch(() => null);
  if (!produced) {
    console.log(`[FAIL]  ${spec.slug} (no PNG at ${outPath}, see ${logPath})`);
    return "failed";
  }

  console.log(`[DONE]  ${spec.slug}`);
  return "done";
}

async function runPool(specs: ImageSpec[], limit: number) {
  const results: Record<string, number> = { done: 0, skipped: 0, failed: 0 };
  let index = 0;

  const workers = Array.from({ length: Math.min(limit, specs.length) }, async () => {
    while (index < specs.length) {
      const myIdx = index++;
      const outcome = await runOne(specs[myIdx]);
      results[outcome]++;
    }
  });

  await Promise.all(workers);
  return results;
}

console.log(
  `Generating ${manifest.images.length} image(s) for ${projectRoot} (concurrency=${concurrency})\n`
);

const summary = await runPool(manifest.images, concurrency);

console.log(`\nSummary:`);
console.log(`  done    : ${summary.done}`);
console.log(`  skipped : ${summary.skipped}`);
console.log(`  failed  : ${summary.failed}`);
console.log(`\nOutput dir: ${imagesDir}`);

if (summary.failed > 0) {
  process.exit(1);
}
