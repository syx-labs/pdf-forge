---
name: pdf-forge
description: Author HTML/Tailwind slides, A4 documents, and shipped social templates, then render and merge them to PDF through the bundled pdf-forge CLI.
---

# pdf-forge

## When to use

Use this skill when the user asks to create a PDF, presentation, pitch deck, report,
proposal, whitepaper, investor update, one-pager, print-formatted document, or polished
document export. Also use it for Instagram posts, carousels, story covers, reels covers,
social media creatives, aspect ratios like 1:1, 4:5, or 9:16, and reference-based visual
grammar extraction. Also use it to **convert a Photoshop `.psd`** (deck, poster, proposal,
fill-in template) into an editable, pixel-faithful deck — see `references/psd-import.md`.

Generate professional, visually striking PDFs using pure HTML + Tailwind CSS. The output aesthetic follows the Vercel/Stripe design philosophy: dark zinc backgrounds, deliberate whitespace, typographic contrast, and restrained color accents. No component libraries, no React, no build step — just raw divs with Tailwind classes rendered via Playwright.

## Engine Entry Point

This skill is the **brain** (design rules and references); the repository-level TypeScript
pipeline is the **engine**. The colocated `bin/pdf-forge` file is only a locator: it
resolves the physical skill path, validates the matching release root, and delegates to
the engine without duplicating it.

Before using assets or the engine, get the active skill directory from the runtime that
loaded this `SKILL.md`—never reuse a path from an earlier release. Resolve symlinks and
derive `PDF_FORGE_HOME` from that active skill:

```bash
# Replace this value with the absolute directory containing this loaded SKILL.md.
PDF_FORGE_SKILL_DIR="<active-skill-directory>"
PDF_FORGE_SKILL_DIR="$(CDPATH='' cd -P "$PDF_FORGE_SKILL_DIR" && pwd)"
PDF_FORGE_HOME="$(CDPATH='' cd -P "$PDF_FORGE_SKILL_DIR/../.." && pwd)"
export PDF_FORGE_HOME

test -x "$PDF_FORGE_SKILL_DIR/bin/pdf-forge"
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" --help
```

Use that wrapper for every command below. It preserves the caller's working directory and
accepts `PDF_FORGE_HOME` only when its physical path matches the active skill release;
a stale or missing override is ignored with a warning. Prefer absolute project paths when
the working directory is not guaranteed. Do not put engine implementations or dependencies
inside the skill directory.

## Workflow

### 1. Detect Format

Determine the output format from the user's request:

- **Slides (16:9)**: presentations, pitch decks, sales decks, investor updates → `1920x1080px`
- **Documents (A4)**: reports, proposals, whitepapers, contracts → `210mm x 297mm`

If ambiguous, ask. The format determines the type scale, spacing, and rendering method.

### 2. Read Brand Configuration

Check for `.claude/pdf-forge.local.md` in the project root. If present, extract brand colors and font preferences from the YAML frontmatter. If absent, use defaults: dark theme, Inter font, purple/orange accent.

Read `references/color-palettes.md` for the full color system and brand substitution rules.

**Brand presets** ship under `assets/themes/` (e.g. `yorus-dark.yaml`). Each preset defines a palette, fonts, and accent gradient that you should honor when composing HTML. Presets with a `brand:` block apply to slides and documents (not only social). When a project's `.claude/pdf-forge.local.md` references a preset, treat that palette as authoritative.

**Yorus interop**: when working on a Yorus project (path matches `yorus`, `alfama`, etc., or `preset: yorus-dark` is set), the `yorus-visual-direction` skill is the source of truth for visual judgment — palette is `#010101 / #ef700b / #8933e2`, voice is active and concrete, anti-AI-slop is non-negotiable. The `yorus-dark.yaml` preset encodes the implementation baseline; the sibling skill handles direction.

### 3. Plan the Page Sequence

Select layouts from the template catalog. Read the appropriate reference:
- Slides: `references/slide-layouts.md` — 8 layouts with composition patterns
- Documents: `references/doc-layouts.md` — 7 layouts with composition patterns

Typical sequences:
- **Pitch deck**: Cover → Impact Stats → Bento Grid → Split Screen → CTA
- **Report**: Doc Cover → Executive Summary → Content Page (xN) → Data Table → Appendix

### 4. Generate HTML Pages

For each page, create a standalone HTML file. Templates live in `$PDF_FORGE_HOME/assets/templates/slides/` and `$PDF_FORGE_HOME/assets/templates/documents/`. Either:
- **Copy and adapt** a template — replace content marked with `<!-- REPLACE: ... -->` comments
- **Compose from scratch** — follow the design system principles in `references/design-system.md`

Name files sequentially: `01-cover.html`, `02-stats.html`, `03-modules.html`, etc.

Every HTML file must be self-contained with the boilerplate shell defined in `references/tailwind-print.md` (section "HTML Template Structure"). The shell includes Tailwind CDN, Inter font loading, and the base CSS reset.

### 5. Self-Check Quality

Before rendering, review each page against `references/anti-patterns.md`. Common traps:
- Too many colors (keep to zinc + one accent pair)
- Cramped content (generous whitespace is non-negotiable)
- Missing hierarchy (headings and body should have visible size contrast)
- Every page looks the same (vary layouts for rhythm)

### 6. Render to PDF

Run the rendering pipeline:

```bash
# First time only: install dependencies
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" setup-browser

# Render HTML pages to images/PDFs
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" render "$PWD/pages" --output "$PWD/rendered"

# Merge into final PDF
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" merge "$PWD/rendered" --output "$PWD/output.pdf"
```

The render script auto-detects the format (slides vs docs) from the HTML content.

The renderer enforces an **overflow guard** on slides and social formats: if rendered content is taller than the viewport (1080px for slides), the render aborts with the offending filename. Pass `allowOverflow: true` (programmatic) or accept the failure as a layout signal — usually the slide needs splitting, tighter spacing, or shorter copy. Docs are exempt (page.pdf paginates natively).

### 7. (Optional) Export to PPTX

When the deliverable is a `.pptx` (boardroom decks, client proposals, anything that goes through PowerPoint/Keynote), convert the rendered PNGs into a full-bleed PPTX:

```bash
# Requires `uv` on PATH (https://docs.astral.sh/uv/)
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" pptx "$PWD/rendered" --output "$PWD/deck.pptx"
```

Auto-detects the aspect from the rendered PNGs (16:9 decks snap to 13.333 × 7.5 in; social/portrait formats keep their true aspect — no stretching). Each PNG becomes one full-bleed slide via `python-pptx` (the only mature library for this). Override with `--aspect 16:9|4:3|16:10|a4-landscape|a4-portrait` or pass `--width <in> --height <in>` for custom.

Pixel-perfect: the PNGs were rendered from your authored HTML, so the PPTX reproduces the design exactly — no template fighting, no font substitution surprises.

### 8. (Optional) Generate AI Imagery

For decks that need original imagery (abstract hero cards, conceptual illustrations), use the parameterized generator. It dispatches `codex` jobs in parallel through the imagegen skill, sharing a common style brief across all slugs:

```bash
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" gen-images "$PWD" "$PWD/image-manifest.yaml" --concurrency 4
```

The manifest is YAML (see `$PDF_FORGE_HOME/scripts/image-manifest.example.yaml`) with `common_style`, `common_palette`, and an `images[]` list of `{slug, concept, aspect?, dimensions?}`. Idempotent — slugs whose PNG already exists are skipped, so reruns are safe.

For Yorus decks, the example manifest already encodes the official palette (`#010101 / #ef700b / #8933e2`) and the dark premium systems-interface brief — copy and edit the `images[]` list per project.

## Workflow — Social (Instagram)

### 1. Detect Sub-Format

When the user requests Instagram content, pick the sub-format:

- `post-1-1` (1080×1080): classic feed, single post
- `post-4-5` (1080×1350): feed portrait — default for modern editorial
- `carousel-1-1` / `carousel-4-5`: multiple slides, same ratio
- `story` (1080×1920): Story or Reels cover

If ambiguous, ask. Feed post default is `post-4-5`.

### 2. Read Theme Preset

The `social:` block in `.claude/pdf-forge.local.md` is a **composition contract you read when writing HTML** — the renderer pipeline never parses it. Every value below must be honored by the HTML Claude emits (palettes, fonts, gradient, footer); the renderer only cares about `data-social-format` on `<body>` for viewport selection.

Key fields:

- `preset`: name of bundled theme from `assets/themes/` (e.g. `dark-editorial`, `warm-minimal`) — Claude reads the YAML and mirrors its `palette` / `fonts` / `accent_gradient` into the HTML.
- `accent_gradient`: override the preset's gradient (`from-X to-Y` Tailwind classes).
- `custom_palette`: override the preset's six palette tokens.
- `fonts_override`: override the preset's `fonts.display` / `fonts.mono`.
- `brand_handle` / `default_footer`: branding automation — Claude inserts these into the generated HTML footer when present.
- `allow_photos`: gates the `photo-overlay` archetype.

If no `social:` block, defaults to `dark-editorial` preset.

Read `assets/themes/README.md` for the full preset list.

### 3. Plan the Sequence (Carousel) or Layout (Single Post)

For carousels, pick 3-10 slides following a narrative:

```
01-cover         → archetype: cover (hook)
02-setup         → archetype: definition or steps
03-content       → archetype: stat/steps/quote
...
0N-cta           → archetype: cta (final)
```

For single posts, pick one archetype matching the content goal.

Archetype catalog: `$PDF_FORGE_HOME/assets/templates/social/<archetype>/<format>.html`.

### 4. Generate HTML Pages

Copy the matching format variant of each archetype and replace `<!-- REPLACE: ... -->` slots with content.

Every file must include `data-social-format="<sub-format>"` on `<body>` — the renderer relies on it for viewport selection.

For custom compositions (escape hatch, no matching archetype), write HTML from scratch using `_shared/boilerplate.html`, respecting type scales (`_shared/type-scales.md`) and safe zones (`_shared/safe-zones.md`).

### 5. Render to PNG

```bash
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" render "$PWD/pages" --format social --output "$PWD/rendered"
```

One PNG per HTML, named from the source filename. Renderer aborts on overflow (body taller than viewport) and on carousel format mismatch.

### 6. Generate Manifest

```bash
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" manifest "$PWD/rendered" --format carousel-4-5 --theme dark-editorial --archetype cover,cover,cover,cover,cover
```

Writes `manifest.yaml` with slide metadata ready for publish tooling or archival. Use one archetype name per PNG — currently only `cover` ships; remaining archetypes land in the archetype-library follow-up plan. The CLI rejects the command if the archetype count doesn't match the PNG count.

### 7. (Optional) Generate Preview

```bash
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" preview "$PWD/rendered"
```

Opens in browser — shows all slides as a grid, with captions and hashtags if present in the manifest.

## Workflow — PSD Import

Convert a Photoshop `.psd` into an editable, pixel-faithful deck. The `.psd` becomes a
**pixel-perfect background plate (text hidden) + editable HTML text** on top. Full detail and
honest limits (substitute fonts, scaffold refinement) in `references/psd-import.md`.

```bash
# One-shot: PSD → deck.pdf (extract+slides+render+merge; auto --viewport p/ não-16:9)
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" psd-deck "$PWD/modelo.psd" --output "$PWD/psd-deck"

# Ou passo a passo (controle fino):
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" psd-extract "$PWD/modelo.psd" --output "$PWD/psd-extract"   # composite + plates + manifest + métricas de tinta
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" psd-slides "$PWD/psd-extract" --output "$PWD/psd-deck"   # HTML editável (placa + textos calibrados)
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" render "$PWD/psd-deck/pages" --format slides --output "$PWD/psd-deck/rendered"  # [--viewport WxH p/ cartaz]
"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" merge "$PWD/psd-deck/rendered" --output "$PWD/psd-deck/deck.pdf"
```

O peso e a largura dos textos já vêm **medidos da tinta** (sem depender de `EngineData`). Refine
o que sobrar no HTML (centralização de texto-ponto, itálico) contra as referências em
`psd-extract/slides/`. Requer `uv` no PATH e o Chromium do Playwright.

## Reference Mode

When the user attaches images of other creatives as inspiration, follow this workflow:

### Step 1: Analyze each reference

For every reference image, describe in text what you see:

1. **Grid & layout**: title position, alignment, density, margins
2. **Palette**: 3 dominant colors, background tone, mono/di/polychrome
3. **Typography**: serif/sans, weight contrast, tracking (positive/negative/zero), size hierarchy
4. **Density**: content/whitespace ratio (dense/balanced/spacious)
5. **Visual elements**: photo, illustration, blocks, borders, shadows, textures
6. **Mood**: editorial / tech / playful / brutalist / minimal / maximal
7. **Nearest archetype**: which internal archetype maps closest

Pause for user correction before generating — if you read the palette or mood wrong, the output compounds the mistake.

### Step 2: Pick fidelity mode

- **Close match**: copy the grammar with maximum fidelity. Bypass templates; compose custom HTML.
- **Style transfer** (default): take the archetype template for the detected archetype, override palette/fonts/density from the reference.
- **Loose inspiration**: keep the brand config theme, borrow only 1-2 elements from the reference.

Ask the user if ambiguous. Default to `style transfer`.

### Step 3: Generate respecting guardrails

- Never copy logos or literal text from the reference
- Safe zones of the target format always apply (even if the reference breaks them)
- If reference format differs from target, reposition rather than stretch
- Commercial fonts replaced by similar Google Fonts; document the substitution in output

## Design Rules

These are non-negotiable. They separate professional output from AI-sloppy:

### Semantic Tracking Tokens
Every template defines four tracking tokens via `tailwind.config`, calibrated from Figma, Stripe, Vercel, Framer, and Linear:
- `tracking-display` (-0.1em): hero headings, mega numbers
- `tracking-heading` (-0.06em): standard headings
- `tracking-body` (-0.025em): body text, descriptions
- `tracking-label` (-0.01em): section labels, tags

Never use Tailwind's generic `tracking-wide`/`wider`/`widest`. Positive letter-spacing is the top marker of AI-generated PDFs.

### Zinc Backbone
90% of the design is zinc shades. Background: `zinc-950`. Text hierarchy through shade: `white` → `zinc-100` → `zinc-300` → `zinc-400` → `zinc-500`. The zinc scale provides structure that works with any accent color.

### One Accent, One Moment
The gradient `from-purple-400 to-orange-400` (or brand equivalent) appears ONLY on the highest-impact element per page — the ROI number, the key stat, the hero metric. Everything else stays zinc. Restraint creates sophistication.

### Geometric Spacing Scale
Spacing follows a geometric progression: 4, 8, 12, 16, 24, 32, 48, 64, 80, 96, 128, 160px. Micro values (4-12px) for internal element gaps, medium (24-48px) for cards and grids, large (64-96px) for page padding and sections. No arbitrary values outside this scale.

### Content Ratio
Slides: 60% content, 40% whitespace. Documents: 70% content, 30% whitespace. When in doubt, remove content rather than reduce spacing.

### Raw HTML Only
No React components, no Shadcn, no Radix UI. Only raw `<div>` elements with Tailwind classes. Component libraries inject spans, aria-attributes, and nested DOM that break Playwright rendering. Keep the DOM flat and predictable.

## Path Resolution

- `references/` paths are relative to this skill directory (where this `SKILL.md` lives)
- `assets/` are resolved from `$PDF_FORGE_HOME`, derived from the physical active skill path
- engine commands go through `$PDF_FORGE_SKILL_DIR/bin/pdf-forge`; stale `PDF_FORGE_HOME` values never select another release
- `install.sh` may set `PDF_FORGE_HOME` for compatibility, but active-skill discovery is authoritative

## Reference Files

Read these as needed — do not load everything upfront:

| File | Read when... |
|------|-------------|
| `references/design-system.md` | Creating layouts from scratch (not from templates) |
| `references/anti-patterns.md` | Self-checking quality before rendering |
| `references/slide-layouts.md` | Building a slide presentation |
| `references/doc-layouts.md` | Building an A4 document |
| `references/color-palettes.md` | User specified brand colors, or switching to light theme |
| `references/tailwind-print.md` | Debugging rendering issues, or needing CSS technique reference |
| `references/psd-import.md` | Converting a `.psd` (deck/poster/proposal/template) into an editable pdf-forge deck |

## Template Files

Ready-to-use HTML templates in `assets/templates/`:

### Slides (`assets/templates/slides/`)
| Template | Use for |
|----------|---------|
| `cover.html` | Opening slide |
| `impact-stats.html` | Problem/opportunity data with big numbers |
| `bento-grid.html` | Features, modules, services in asymmetric grid |
| `split-screen.html` | Cost vs return, before vs after |
| `timeline.html` | Roadmap, phases, milestones |
| `comparison.html` | Us vs them, plan comparison |
| `quote.html` | Testimonials, founder vision |
| `cta.html` | Call to action, contact info |

### Documents (`assets/templates/documents/`)
| Template | Use for |
|----------|---------|
| `doc-cover.html` | Report/proposal cover page |
| `executive-summary.html` | Key metrics and summary after cover |
| `content-page.html` | Narrative text with heading hierarchy |
| `data-table.html` | Financial data, metrics tables |
| `two-column.html` | Parallel information, specs |
| `visual-full.html` | Charts, diagrams, full-width visuals |
| `appendix.html` | Dense supplementary data |

**Themed family — `ivory-editorial/`**: light-editorial A4 kit (ivory + pine + terracotta, Cormorant Garamond display) for didactic and mentoring material — cover, content page, term list, numbered steps, rule cards, task page, prompt blocks, data table, links, FAQ, and a diagram page for pre-rendered mermaid SVGs. Pairs with the `ivory-editorial` theme preset. Read the family's `NOTES.md` first: it documents the shared page shell, the four negative semantic tracking tokens, and the mermaid workflow (`"$PDF_FORGE_SKILL_DIR/bin/pdf-forge" mermaid ...` renders mermaid to static SVG with the real font loaded — required because the doc renderer never awaits async scripts).

### Social — Instagram (`assets/templates/social/`)

Each archetype has five format variants: `post-1-1.html`, `post-4-5.html`, `carousel-1-1.html`, `carousel-4-5.html`, `story.html`. See the archetype's `NOTES.md` for variants and slot conventions.

| Archetype | Purpose |
|----------|---------|
| `cover/` | Opening slide — carousel hook or bold single-post headline |

Only `cover/` ships today. For other needs (mega stats, steps, quotes, before/after, definitions, checklists, CTAs, photo overlays, bento grids), compose custom HTML from `_shared/boilerplate.html` using the type-scales and safe-zones references. The planned-but-unshipped archetype list lives in `references/social-archetypes-planned.md`.

Shared resources: `_shared/boilerplate.html`, `_shared/type-scales.md`, `_shared/safe-zones.md`.

## Quick Type Reference

### Slides (1920x1080)
- Section Label: `text-xl font-mono uppercase tracking-label`
- Hero Heading: `text-7xl font-semibold tracking-heading leading-tight`
- Body: `text-2xl text-zinc-400 font-light tracking-body leading-relaxed`
- Big Number: `text-8xl font-bold tracking-display`
- Mega Number: `text-[120px] font-bold leading-none tracking-display`

### Documents (A4)
- Section Label: `text-xs font-mono uppercase tracking-label`
- Heading 1: `text-4xl font-semibold tracking-heading`
- Body: `text-base text-zinc-400 tracking-body leading-relaxed`
- Big Number: `text-5xl font-bold tracking-display`

Full scales in `references/design-system.md`.

### Social (varies by aspect ratio)

Full tables in `assets/templates/social/_shared/type-scales.md`. Key highlights:

- `post-4-5` hero heading: `text-6xl font-semibold tracking-heading leading-tight`
- `post-4-5` mega number: `text-[200px] font-bold leading-none tracking-display`
- `story` hero heading: `text-7xl font-semibold tracking-heading leading-tight`
- Safe-zone padding for story: `pt-[250px] pb-[280px]` on wrapping div
