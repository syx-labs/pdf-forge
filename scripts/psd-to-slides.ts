/**
 * psd-to-slides.ts — Gera HTML de slides editáveis a partir de um extract de PSD.
 *
 * Lê <extract-dir>/manifest.json (de psd-extract.ts). Para cada artboard emite um
 * HTML no formato `slides` do pdf-forge: a PLACA (fundo pixel-perfect, sem texto)
 * como <img> full-bleed + cada texto como <div> editável posicionado no bbox do PSD,
 * com cor medida e largura casada via transform:scaleX (encaixe pixel). A fonte
 * original do PSD raramente é recuperável -> usa uma fonte substituta (Google Fonts,
 * default Montserrat); ajuste fino de peso/alinhamento é esperado no HTML gerado.
 *
 * Uso:
 *   bun run scripts/psd-to-slides.ts <extract-dir> [--output <dir>] [--font "Montserrat"]
 *   bun run scripts/render-pdf.ts <output>/pages --format slides --output <render>
 */
import { resolve, dirname } from "node:path";
import { mkdir, readFile, copyFile, readdir } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";

interface TextEntry {
  idx: number | null;
  text: string | null;
  bbox_rel: [number, number, number, number];
  w: number;
  h: number;
  color: string | null;
  font: string | null;
  // Métricas medidas da tinta (extract.py) — ausentes em PSDs antigos do schema:
  cap_height?: number | null;
  align?: "left" | "center" | "right" | null;
  weight_hint?: number | null;
}
interface Artboard {
  index: number; name: string; slug: string;
  bbox: [number, number, number, number]; width: number; height: number;
  reference: string; plate: string;
}
interface Manifest {
  width: number; height: number; color_mode: string;
  artboards: Artboard[]; fonts: Record<string, number>;
  fonts_recoverable: boolean; texts: Record<string, TextEntry[]>;
}

const args = process.argv.slice(2);
let extractDir = "";
let outputDir = "";
let font = "Montserrat";

function requireNext(flag: string, value: string | undefined): string {
  if (value === undefined || value === "" || /^-{1,2}[A-Za-z]/.test(value)) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return value;
}
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--output" || arg === "-o") outputDir = requireNext(arg, args[++i]);
  else if (arg === "--font") font = requireNext(arg, args[++i]);
  else if (arg === "--help" || arg === "-h") {
    console.log('Usage: bun run scripts/psd-to-slides.ts <extract-dir> [--output <dir>] [--font "Montserrat"]');
    process.exit(0);
  } else if (!arg.startsWith("--")) extractDir = arg;
}
if (!extractDir) {
  console.error('Usage: bun run scripts/psd-to-slides.ts <extract-dir> [--output <dir>] [--font "Montserrat"]');
  process.exit(1);
}

const extractAbs = resolve(extractDir);
const outAbs = resolve(outputDir || resolve(extractAbs, "deck"));
const pagesDir = resolve(outAbs, "pages");
const imgDir = resolve(pagesDir, "img");

const manifest = JSON.parse(
  await readFile(resolve(extractAbs, "manifest.json"), "utf-8")
) as Manifest;

const fontParam = font.replace(/\s+/g, "+");
const fontCss = `'${font}'`;
const FONT_LINK =
  `<link rel="preconnect" href="https://fonts.googleapis.com">` +
  `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link href="https://fonts.googleapis.com/css2?family=${fontParam}:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">`;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

await mkdir(imgDir, { recursive: true });

const browser: Browser = await chromium.launch();
const page: Page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8">${FONT_LINK}` +
  `<style>*{margin:0;padding:0}#m{position:absolute;left:0;top:0;line-height:1;white-space:nowrap;font-family:${fontCss}}</style>` +
  `</head><body><span id="m"></span></body></html>`
);
await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

async function naturalWidth(text: string, fontPx: number, weight: number, ls: string): Promise<number> {
  return page.evaluate((a: { text: string; fontPx: number; weight: number; ls: string }) => {
    const el = document.getElementById("m") as HTMLElement;
    el.textContent = a.text;
    el.style.fontSize = a.fontPx + "px";
    el.style.fontWeight = String(a.weight);
    el.style.letterSpacing = a.ls;
    return el.getBoundingClientRect().width;
  }, { text, fontPx, weight, ls });
}

function weightFor(h: number): number {
  if (h >= 60) return 800;
  if (h >= 38) return 700;
  if (h >= 24) return 600;
  return 600;
}

// Peso: prefere o medido (espessura de traço); senão cai no heurístico por altura.
// Texto muito pequeno infla o stroke_ratio (antialias) → limita o exagero.
function resolveWeight(t: TextEntry, h: number): number {
  const w = t.weight_hint ?? weightFor(h);
  if (h < 26) return Math.min(w, 600);
  return w;
}

let warned = false;
const generated: string[] = [];

for (const art of manifest.artboards) {
  const entries = (manifest.texts[art.slug] || []).filter(
    (t) => t.text && t.w > 0 && t.h > 0
  );
  const parts: string[] = [];

  for (const t of entries) {
    const [x, y] = t.bbox_rel;
    const bw = t.w, bh = t.h;
    const color = t.color || "#0a2a5e";
    const weight = resolveWeight(t, bh);
    const align = t.align ?? "left";
    const ls = weight >= 800 ? "-0.015em" : "0";
    const fontPx0 = Math.max(11, Math.round(bh));
    const natural = await naturalWidth(t.text as string, fontPx0, weight, ls);
    const wrap = natural > bw * 1.35;

    if (wrap) {
      const lines = Math.max(2, Math.round(natural / bw));
      const lh = 1.25;
      const fontPx = Math.max(11, Math.round(bh / (lines * lh)));
      parts.push(
        `<div style="position:absolute;left:${x}px;top:${y}px;width:${bw}px;` +
        `font-size:${fontPx}px;font-weight:${weight};line-height:${lh};color:${color};` +
        `text-align:${align};font-family:${fontCss};">${esc(t.text as string)}</div>`
      );
    } else if (align === "center" || align === "right") {
      // texto em caixa: alinha dentro da largura do bbox, sem scaleX (não distorce)
      const dy = -Math.round(0.07 * fontPx0);
      parts.push(
        `<div style="position:absolute;left:${x}px;top:${y + dy}px;width:${bw}px;` +
        `font-size:${fontPx0}px;font-weight:${weight};line-height:1;color:${color};` +
        `text-align:${align};white-space:nowrap;font-family:${fontCss};letter-spacing:${ls};">${esc(t.text as string)}</div>`
      );
    } else {
      const scaleX = Math.min(1.25, Math.max(0.8, bw / natural));
      const dy = -Math.round(0.07 * fontPx0);
      parts.push(
        `<div style="position:absolute;left:${x}px;top:${y + dy}px;` +
        `font-size:${fontPx0}px;font-weight:${weight};line-height:1;color:${color};` +
        `white-space:nowrap;font-family:${fontCss};letter-spacing:${ls};` +
        `transform:scaleX(${scaleX.toFixed(3)});transform-origin:0 0;">${esc(t.text as string)}</div>`
      );
    }
  }

  // copia a placa para pages/img/
  await copyFile(resolve(extractAbs, art.plate), resolve(imgDir, art.slug + ".png"));

  const isSlides = art.width === 1920 && art.height === 1080;
  if (!isSlides && !warned) {
    console.warn(
      `Warning: artboard "${art.slug}" é ${art.width}x${art.height} (≠ 1920x1080). ` +
      `O HTML sai no tamanho nativo; para renderizar use um viewport equivalente ` +
      `(o pipeline 'slides' assume 1920x1080).`
    );
    warned = true;
  }
  const rootW = isSlides ? 1920 : art.width;
  const rootH = isSlides ? 1080 : art.height;

  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<script src="https://cdn.tailwindcss.com"></script>
${FONT_LINK}
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:${fontCss},system-ui,sans-serif}</style>
</head>
<body>
  <div class="w-[${rootW}px] h-[${rootH}px] relative overflow-hidden bg-white">
    <img src="img/${art.slug}.png" class="absolute inset-0" width="${rootW}" height="${rootH}" alt="">
${parts.map((p) => "    " + p).join("\n")}
  </div>
</body></html>`;
  await Bun.write(resolve(pagesDir, art.slug + ".html"), html);
  generated.push(art.slug);
  console.log(`  ${art.slug}.html  (${entries.length} textos)`);
}

await browser.close();

const imgCount = (await readdir(imgDir)).length;
console.log(`\n${generated.length} slide(s) gerados em ${pagesDir} (${imgCount} placas).`);
if (!manifest.fonts_recoverable) {
  console.log(
    `Fonte original não estava no PSD → usei "${font}" (substituta). ` +
    `Ajuste peso/alinhamento/quebra no HTML conforme a referência em ${resolve(extractAbs, "slides")}.`
  );
}
console.log(`\nRender: bun run scripts/render-pdf.ts ${pagesDir} --format slides --output ${resolve(outAbs, "rendered")}`);
console.log(`Merge:  bun run scripts/merge-pages.ts ${resolve(outAbs, "rendered")} --output ${resolve(outAbs, "deck.pdf")}`);
