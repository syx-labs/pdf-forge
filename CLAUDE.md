# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

pdf-forge is **two things in one repo**, and the split is the key mental model:

1. **An AI-facing skill** (`skills/pdf-forge/`) — the "brain". `SKILL.md` + `references/*.md` encode a complete design system (typography scales, spacing grid, zinc palette, anti-patterns) and instruct an agent to author self-contained HTML pages. This is content, not code; it ships verbatim to many agents.
2. **A TypeScript rendering pipeline** (`src/`, `scripts/`, `bin/`) — the "engine". It takes the agent-authored HTML and rasterizes it to PNG/PDF/PPTX via Playwright + pdf-lib. Pure Bun/Node, no framework.

The agent writes HTML using the skill's rules; the pipeline renders it. When editing, keep that boundary clean: design decisions live in `skills/`, rendering mechanics live in `src/`.

It distributes through **three surfaces** that all wrap the same `skills/` + `src/`:
- **Skill symlinks** (`install.sh`) for Warp/Cursor/Codex/Gemini/etc., gated by `PDF_FORGE_HOME`.
- **Claude Code plugin** (`.claude-plugin/`).
- **MCP server** (`src/mcp/server.ts`, launched by `bin/pdf-forge.ts`) for Claude Desktop, published to npm as `pdf-forge-mcp`.

## Commands

```bash
bun install                        # deps
bun run scripts/setup.ts           # one-time: installs Playwright Chromium
bun run typecheck                  # tsc --noEmit (strict)
bun run build                      # tsup → dist/ (this is the build, NOT tsc)
bun test                           # full suite — runs --parallel=1, 60s timeout (Playwright contention)
bun test tests/core/utils.test.ts  # single file (this is the pure-unit set CI runs without a browser)
bun test -t "overflow"             # single test by name
```

CI (`.github/workflows/ci.yml`) splits into a **browserless `check` job** (typecheck + `tests/core/utils.test.ts` + build) and an **`integration` job** that installs Chromium first. Anything touching `renderer`/`merger`/integration tests needs Chromium locally — run `setup.ts` or `bunx playwright install chromium` or it fails opaquely.

### Pipeline scripts (also exposed as `bun run render|merge|pptx|gen-images|mermaid`)

```bash
bun run scripts/render-pdf.ts <pages-dir> [--format slides|docs|social] [--social-format <preset>] [--output <dir>] [--scale 2] [--viewport WxH]
bun run scripts/merge-pages.ts <rendered-dir> [--output out.pdf]
bun run scripts/png-to-pptx.ts <rendered-dir> [--aspect 16:9|4:3|16:10|a4-landscape|a4-portrait] [--output deck.pptx]   # needs `uv`
bun run scripts/generate-manifest.ts <rendered-dir> --format <social-format> [--archetype a,b,c] [--theme] [--caption] [--hashtags]
bun run scripts/generate-preview.ts <rendered-dir> [--output preview.html]
bun run scripts/gen-images.ts <project-root> <manifest.yaml> [--concurrency 4]                                          # needs `codex` CLI
bun run scripts/prerender-mermaid.ts <manifest.yaml> --output <dir>                                                     # mermaid → SVG estático (carrega a fonte real antes de medir); needs Chromium
bun run scripts/psd-to-deck.ts <file.psd> [--output <dir>] [--font "Montserrat"] [--scale 2] [--assets]                 # one-shot PSD→PDF; needs uv+Chromium
bun run scripts/psd-extract.ts <file.psd> [--output <dir>] [--assets]                                                   # needs `uv` (psd-tools)
bun run scripts/psd-to-slides.ts <extract-dir> [--output <dir>] [--font "Montserrat"]                                   # needs Chromium
```

`--viewport WxH` overrides the `slides` 1920×1080 screenshot size (decks/posters of another fixed
size, e.g. a non-16:9 PSD artboard). Ignored for `docs`/`social`. See `src/core/renderer.ts` (slides branch).

### PSD import (`bun run psd:deck|psd:extract|psd:slides`)

Converts a `.psd` into an editable deck. **`psd-to-deck.ts` is the one-shot** (extract→slides→render→merge,
auto-passes `--viewport` when the deck isn't 1920×1080). Under it: `psd-extract.ts` runs `scripts/psd/extract.py`
(psd-tools, deps via PEP 723 inline metadata + `uv run`) to emit the **composite**, per-artboard
**reference** crops, per-artboard **plates** (composite with text hidden = pixel-perfect background),
and `manifest.json`. Per text, beyond bbox+color it stores **design metrics measured from the ink**
(diff reference×plate — robust even without `EngineData`): `cap_height`, `weight_hint` (400–900 from
stroke thickness via distance-transform), `align`, `ink_bbox_rel`, `stroke_ratio`. `psd-to-slides.ts`
turns that into `slides`-format HTML: the plate as a full-bleed `<img>` + each text as an editable
`<div>` placed at its PSD bbox, width-matched via `transform:scaleX`, using the measured `weight_hint`/`align`.
The original font is usually absent (`fonts_recoverable:false`) → a substitute Google Font is used; the
generated HTML is a scaffold to refine (centering of point-text, italics) against the reference crops.
Full spec: `skills/pdf-forge/references/psd-import.md`. Same uv pattern as `png-to-pptx.ts`.

## Architecture invariants

**Format is inferred from the HTML, not configured.** `src/core/utils.ts:detectFormat` reads the *first* HTML file: `w-[1920px]` → `slides`, `w-[210mm]` → `docs`, a `data-social-format="..."` attr on `<body>` → `social`. If you change template root classes, you break detection. Three formats: `slides | docs | social` (`src/core/types.ts`).

**Rendering branches by format** (`src/core/renderer.ts`):
- `slides` → 1920×1080 viewport → `page.screenshot` PNG
- `social` → viewport from `SOCIAL_VIEWPORTS` (`src/core/social-presets.ts`) → screenshot PNG
- `docs` → `page.pdf` A4 (paginates natively)

**Overflow guard** aborts the render for `slides`/`social` if `documentElement.scrollHeight > viewport.height + 2px` (2px sub-pixel tolerance — do not tighten to `>`, it flakes). Docs are exempt. Treat an overflow error as a *layout signal* (split the slide / cut copy), not a bug to suppress — `allowOverflow: true` is the deliberate escape hatch.

**Merging** (`src/core/merger.ts`) auto-detects PNG vs PDF in the input dir: PNGs → pdf-lib pages sized by each PNG's intrinsic aspect, normalized to a **1440px long edge** (16:9 still lands on 1440×810; social 1:1/4:5/9:16 keep their true shape via `fitToLongEdge` in `src/core/image-size.ts` — no squashing); PDFs → page copy. PNG and PDF inputs are not mixed.

**The social YAML `social:` block is a composition contract for the agent, not runtime config.** The pipeline only ever reads `data-social-format` off `<body>`. Everything in `.claude/pdf-forge.local.md`'s `social:` block (preset, palette, gradient, footer) is consumed by *Claude when authoring HTML* — never parsed by `src/`. Don't add code that reads it.

**Only the `cover` social archetype ships.** `assets/templates/social/` has just `cover/`; the rest of the vocabulary is documented as planned in `skills/pdf-forge/references/social-archetypes-planned.md` and composed ad-hoc from `_shared/boilerplate.html`. `generate-manifest.ts` does **not** validate archetype names against shipped templates — it only enforces count == PNG count.

**The MCP tool exposes `slides`/`docs` only** (`src/mcp/server.ts`, `generate_pdf`), not social. It accepts HTML strings, writes them to a temp dir, renders, merges, returns `{path, pageCount, fileSize}`.

## Conventions & gotchas

- **ESM with explicit `.js` extensions inside `src/`** (e.g. `import ... from "./types.js"` from a `.ts` file). Scripts in `scripts/` import the source *without* extension (`../src/core/renderer`) because Bun runs them directly. Match the neighboring file's style.
- **Strict TS, no `any`.** Validate external input at runtime (the codebase uses zod in MCP, hand-rolled `isValid*` guards elsewhere). `RenderResult` is a discriminated union on `format` — narrow with `if (result.format === "social")` to get non-optional `socialFormat`.
- **Two root-resolution patterns.** `PLUGIN_ROOT`/path resolution checks whether `__dirname` contains `"dist"` to decide how many levels up the project root is (source vs built layout) — see `src/mcp/server.ts` and `bin/pdf-forge.ts`. The skill resolves `assets/`/`scripts/` via `$PDF_FORGE_HOME` and `references/` relative to `SKILL.md`.
- **Version lives in two files.** `package.json` and `.claude-plugin/plugin.json` versions must match; the MCP server reads `package.json` at runtime to report its version (intentional — fixes prior 0.1.0/0.3.x drift). Bump both on release. Publishing is tag-driven (`v*` → `.github/workflows/publish.yml`).
- **`bun.lock` is gitignored** (along with `dist/`, `*.pdf`, `output/`, `rendered/`, `pages/`, `.claude/*.local.md`). Generated render output is never committed.
- **External-tool scripts degrade loudly, not silently.** `gen-images.ts` (codex) and `png-to-pptx.ts` (uv) surface spawn errors as failed items / exit codes rather than swallowing them — preserve that when editing.

## Design system (non-negotiable, enforced by review not by code)

When authoring or reviewing HTML templates, these are the rules that separate the output from generic AI PDFs (full detail in `skills/pdf-forge/SKILL.md` and `references/`):

- **Negative tracking only.** Use the four semantic tokens (`tracking-display` -0.1em / `tracking-heading` -0.06em / `tracking-body` -0.025em / `tracking-label` -0.01em), never Tailwind's `tracking-wide/wider/widest`. Positive letter-spacing is the #1 AI-slop tell.
- **Zinc backbone, one accent moment.** ~90% zinc shades; the accent gradient appears on exactly one hero element per page.
- **Geometric spacing only** (4/8/12/16/24/32/48/64/80/96/128/160px) — no arbitrary values.
- **Raw `<div>` + Tailwind, flat DOM.** No React/Shadcn/Radix — nested component DOM breaks predictable Playwright rendering.
