/**
 * psd-extract.ts — Extrai design de um PSD (composite, placas, textos) para o pipeline.
 *
 * Usa psd-tools via `uv run` (deps inline PEP 723 em scripts/psd/extract.py).
 * Requer `uv` (https://docs.astral.sh/uv/) no PATH — mesmo padrão do png-to-pptx.ts.
 *
 * Para cada artboard do PSD gera uma REFERÊNCIA (com texto) e uma PLACA (sem texto,
 * fundo pixel-perfect) + um manifest.json com os textos (string, bbox, cor medida).
 * Depois rode `psd-to-slides.ts` para gerar os HTML editáveis e `render-pdf.ts`.
 *
 * Uso:
 *   bun run scripts/psd-extract.ts <arquivo.psd> [--output <dir>] [--assets]
 */
import { resolve, dirname } from "node:path";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let psdPath = "";
let outputDir = "./psd-extract";
let assets = false;

function requireNext(flag: string, value: string | undefined): string {
  if (value === undefined || value === "" || /^-{1,2}[A-Za-z]/.test(value)) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return value;
}

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output" || arg === "-o") {
    outputDir = requireNext(arg, args[++i]);
  } else if (arg === "--assets") {
    assets = true;
  } else if (arg === "--help" || arg === "-h") {
    console.log(
      "Usage: bun run scripts/psd-extract.ts <file.psd> [--output <dir>] [--assets]"
    );
    process.exit(0);
  } else if (!arg.startsWith("--")) {
    psdPath = arg;
  }
}

if (!psdPath) {
  console.error("Usage: bun run scripts/psd-extract.ts <file.psd> [--output <dir>] [--assets]");
  process.exit(1);
}

const psdAbs = resolve(psdPath);
const outAbs = resolve(outputDir);

const s = await stat(psdAbs).catch(() => null);
if (!s || !s.isFile()) {
  console.error(`"${psdAbs}" is not a file.`);
  process.exit(1);
}

const extractPy = resolve(import.meta.dir, "psd", "extract.py");

console.log(`Extracting PSD → ${outAbs} (via uv run psd-tools)...`);

const uvArgs = ["run", extractPy, psdAbs, outAbs];
if (assets) uvArgs.push("--assets");

const child = spawn("uv", uvArgs, {
  stdio: ["ignore", "pipe", "inherit"],
  cwd: dirname(extractPy),
});

let stdout = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

const exitInfo: { code: number; spawnError?: Error } = await new Promise((res) => {
  child.on("close", (c) => res({ code: c ?? 1 }));
  child.on("error", (err) => res({ code: 1, spawnError: err }));
});

if (exitInfo.spawnError) {
  console.error(
    `Failed to spawn \`uv\`: ${exitInfo.spawnError.message}. Install uv from https://docs.astral.sh/uv/.`
  );
  process.exit(1);
}
if (exitInfo.code !== 0) {
  console.error(`psd extraction failed (exit ${exitInfo.code}). See stderr above.`);
  process.exit(exitInfo.code);
}

try {
  const parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "{}");
  console.log(`\nDocument: ${parsed.doc}`);
  console.log(`Artboards: ${parsed.artboards}  |  Texts: ${parsed.texts}`);
  console.log(
    `Fonts recoverable from PSD: ${parsed.fonts_recoverable ? "yes" : "no (use a substitute font in psd-to-slides)"}`
  );
  console.log(`\nNext: bun run scripts/psd-to-slides.ts ${outAbs}`);
} catch {
  console.log(stdout);
}
