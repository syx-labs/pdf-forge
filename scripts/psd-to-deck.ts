/**
 * psd-to-deck.ts — one-shot: PSD → PDF editável.
 *
 * Encadeia psd-extract → psd-to-slides → render-pdf → merge-pages num comando só.
 * Detecta o tamanho dos artboards e passa --viewport automaticamente quando o deck
 * não é 1920×1080 (cartaz/single-artboard de tamanho arbitrário renderiza certo).
 *
 * Uso:
 *   bun run scripts/psd-to-deck.ts <file.psd> [--output <dir>] [--font "Montserrat"]
 *                                  [--scale 2] [--assets]
 * Saídas em <dir>/: extract/ (composite,placas,manifest), deck/pages (HTML editável),
 * deck/rendered (PNG) e deck.pdf.
 */
import { resolve, dirname } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
let psdPath = "";
let outputDir = "./psd-deck";
let font = "Montserrat";
let scale = "2";
let assets = false;

interface ArtboardSize {
  width: number;
  height: number;
}

interface PsdDeckManifest {
  artboards: ArtboardSize[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isArtboardSize(value: unknown): value is ArtboardSize {
  return (
    isRecord(value) &&
    typeof value.width === "number" &&
    typeof value.height === "number"
  );
}

function isPsdDeckManifest(value: unknown): value is PsdDeckManifest {
  return (
    isRecord(value) &&
    Array.isArray(value.artboards) &&
    value.artboards.every(isArtboardSize)
  );
}

function needValue(flag: string, v: string | undefined): string {
  if (v === undefined || v === "" || /^-{1,2}[A-Za-z]/.test(v)) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return v;
}
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--output" || a === "-o") outputDir = needValue(a, args[++i]);
  else if (a === "--font") font = needValue(a, args[++i]);
  else if (a === "--scale") scale = needValue(a, args[++i]);
  else if (a === "--assets") assets = true;
  else if (a === "--help" || a === "-h") {
    console.log('Usage: bun run scripts/psd-to-deck.ts <file.psd> [--output <dir>] [--font "Montserrat"] [--scale 2] [--assets]');
    process.exit(0);
  } else if (!a.startsWith("--")) psdPath = a;
}
if (!psdPath) {
  console.error('Usage: bun run scripts/psd-to-deck.ts <file.psd> [--output <dir>] [--font "Montserrat"] [--scale 2] [--assets]');
  process.exit(1);
}

const psdAbs = resolve(psdPath);
const outAbs = resolve(outputDir);
const s = await stat(psdAbs).catch(() => null);
if (!s || !s.isFile()) {
  console.error(`"${psdAbs}" is not a file.`);
  process.exit(1);
}

const SCRIPTS = import.meta.dir;
const extractDir = resolve(outAbs, "extract");
const deckDir = resolve(outAbs, "deck");
const pagesDir = resolve(deckDir, "pages");
const renderedDir = resolve(deckDir, "rendered");
const pdfPath = resolve(outAbs, "deck.pdf");

function run(script: string, scriptArgs: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn("bun", ["run", resolve(SCRIPTS, script), ...scriptArgs], {
      stdio: "inherit",
      cwd: dirname(SCRIPTS),
    });
    child.on("error", rej);
    child.on("close", (code) =>
      code === 0 ? res() : rej(new Error(`${script} exited ${code}`))
    );
  });
}

try {
  // 1) extract
  console.log("\n[1/4] Extraindo PSD…");
  const exArgs = [psdAbs, "--output", extractDir];
  if (assets) exArgs.push("--assets");
  await run("psd-extract.ts", exArgs);

  // viewport automático: se todos os artboards têm o mesmo tamanho ≠ 1920×1080
  const parsedManifest: unknown = JSON.parse(
    await readFile(resolve(extractDir, "manifest.json"), "utf-8")
  );
  if (!isPsdDeckManifest(parsedManifest)) {
    throw new Error("manifest.json inválido: artboards deve conter width/height numéricos.");
  }
  const manifest = parsedManifest;
  const sizes = new Set(manifest.artboards.map((a) => `${a.width}x${a.height}`));
  let viewport: string | undefined;
  if (sizes.size === 1) {
    const only = [...sizes][0];
    if (only !== "1920x1080") viewport = only;
  } else if (![...sizes].every((z) => z === "1920x1080")) {
    console.warn(
      `Aviso: artboards de tamanhos mistos (${[...sizes].join(", ")}). ` +
      `Renderizando em 1920×1080 — slides de outro tamanho podem cortar. ` +
      `Separe por tamanho e renderize com --viewport.`
    );
  }

  // 2) slides
  console.log("\n[2/4] Gerando HTML editável…");
  await run("psd-to-slides.ts", [extractDir, "--output", deckDir, "--font", font]);

  // 3) render
  console.log("\n[3/4] Renderizando…");
  const rArgs = [pagesDir, "--format", "slides", "--output", renderedDir, "--scale", scale];
  if (viewport) rArgs.push("--viewport", viewport);
  await run("render-pdf.ts", rArgs);

  // 4) merge
  console.log("\n[4/4] Montando PDF…");
  await run("merge-pages.ts", [renderedDir, "--output", pdfPath]);

  console.log(`\n✓ Deck pronto: ${pdfPath}`);
  console.log(`  HTML editável: ${pagesDir}`);
  console.log(`  Referências (conferir fidelidade): ${resolve(extractDir, "slides")}`);
} catch (err) {
  console.error("\npsd-to-deck falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
}
