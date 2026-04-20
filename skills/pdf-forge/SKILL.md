---
name: pdf-forge
description: >
  This skill should be used when the user asks to "create a PDF", "make a presentation",
  "generate a pitch deck", "build a report", "design slides", "create a proposal",
  "make a document look professional", "generate a sales deck", "create a whitepaper",
  "build a financial report", "make a deck", "create an investor update",
  "format a document for printing", "export as PDF", "create a one-pager",
  or mentions PDF generation, slide design, or document formatting.
  Also triggers when the user complains about AI-generated PDFs looking generic, ugly,
  or "AI-sloppy", or wants high-quality visual output for print or screen.
  Use this skill even for simple PDF requests — it ensures professional quality by default.
  Also triggers for Instagram content: "create an Instagram post", "make a carousel",
  "generate a story cover", "design social media creatives", "Instagram carrossel",
  "reels cover", or mentions of posting to Instagram, aspect ratios (1:1, 4:5, 9:16),
  or "creatives from references" (Reference Mode — feed images, extract visual grammar).
---

# pdf-forge

Generate professional, visually striking PDFs using pure HTML + Tailwind CSS. The output aesthetic follows the Vercel/Stripe design philosophy: dark zinc backgrounds, deliberate whitespace, typographic contrast, and restrained color accents. No component libraries, no React, no build step — just raw divs with Tailwind classes rendered via Playwright.

## Workflow

### 1. Detect Format

Determine the output format from the user's request:

- **Slides (16:9)**: presentations, pitch decks, sales decks, investor updates → `1920x1080px`
- **Documents (A4)**: reports, proposals, whitepapers, contracts → `210mm x 297mm`

If ambiguous, ask. The format determines the type scale, spacing, and rendering method.

### 2. Read Brand Configuration

Check for `.claude/pdf-forge.local.md` in the project root. If present, extract brand colors and font preferences from the YAML frontmatter. If absent, use defaults: dark theme, Inter font, purple/orange accent.

Read `references/color-palettes.md` for the full color system and brand substitution rules.

### 3. Plan the Page Sequence

Select layouts from the template catalog. Read the appropriate reference:
- Slides: `references/slide-layouts.md` — 8 layouts with composition patterns
- Documents: `references/doc-layouts.md` — 7 layouts with composition patterns

Typical sequences:
- **Pitch deck**: Cover → Impact Stats → Bento Grid → Split Screen → CTA
- **Report**: Doc Cover → Executive Summary → Content Page (xN) → Data Table → Appendix

### 4. Generate HTML Pages

For each page, create a standalone HTML file. Templates live in `assets/templates/slides/` and `assets/templates/documents/`. Either:
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
bun run $PDF_FORGE_HOME/scripts/setup.ts

# Render HTML pages to images/PDFs
bun run $PDF_FORGE_HOME/scripts/render-pdf.ts ./pages/ --output ./rendered/

# Merge into final PDF
bun run $PDF_FORGE_HOME/scripts/merge-pages.ts ./rendered/ --output ./output.pdf
```

The render script auto-detects the format (slides vs docs) from the HTML content.

## Workflow — Social (Instagram)

### 1. Detect Sub-Format

When the user requests Instagram content, pick the sub-format:

- `post-1-1` (1080×1080): classic feed, single post
- `post-4-5` (1080×1350): feed portrait — default for modern editorial
- `carousel-1-1` / `carousel-4-5`: multiple slides, same ratio
- `story` (1080×1920): Story or Reels cover

If ambiguous, ask. Feed post default is `post-4-5`.

### 2. Read Theme Preset

Check `.claude/pdf-forge.local.md` for a `social:` block. Key fields:

- `preset`: name of bundled theme from `assets/themes/` (e.g. `dark-editorial`, `warm-minimal`)
- `theme`, `accent_gradient`, `custom_palette`, `fonts_override`: override any preset field
- `brand_handle`, `default_footer`: branding automation
- `allow_photos`: gates the photo-overlay archetype

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

Archetype catalog: `assets/templates/social/<archetype>/<format>.html`.

### 4. Generate HTML Pages

Copy the matching format variant of each archetype and replace `<!-- REPLACE: ... -->` slots with content.

Every file must include `data-social-format="<sub-format>"` on `<body>` — the renderer relies on it for viewport selection.

For custom compositions (escape hatch, no matching archetype), write HTML from scratch using `_shared/boilerplate.html`, respecting type scales (`_shared/type-scales.md`) and safe zones (`_shared/safe-zones.md`).

### 5. Render to PNG

```bash
bun run scripts/render-pdf.ts ./pages/ --format social --output ./rendered/
```

One PNG per HTML, named from the source filename. Renderer aborts on overflow (body taller than viewport) and on carousel format mismatch.

### 6. Generate Manifest

```bash
bun run scripts/generate-manifest.ts ./rendered/ --format carousel-4-5 --theme dark-editorial --archetype cover,definition,steps,quote,cta
```

Writes `manifest.yaml` with slide metadata ready for publish tooling or archival.

### 7. (Optional) Generate Preview

```bash
bun run scripts/generate-preview.ts ./rendered/
```

Opens in browser — shows all slides as a grid, with captions and hashtags if present in the manifest.

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
- `assets/` and `scripts/` paths are relative to `$PDF_FORGE_HOME` (the project root)
- `$PDF_FORGE_HOME` is set during installation via `install.sh` — it points to the pdf-forge project root

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

### Social — Instagram (`assets/templates/social/`)

Each archetype has five format variants: `post-1-1.html`, `post-4-5.html`, `carousel-1-1.html`, `carousel-4-5.html`, `story.html`. See the archetype's `NOTES.md` for variants and slot conventions.

| Archetype | Purpose |
|----------|---------|
| `cover/` | Opening slide — carousel hook or bold single-post headline |
| `mega-stat/` | One huge number centered — ROI, percentage, hero metric *(planned)* |
| `steps/` | Numbered list — framework, how-to, playbook *(planned)* |
| `quote/` | Centered pull quote with attribution *(planned)* |
| `before-after/` | Split view — problem vs solution, cost vs return *(planned)* |
| `definition/` | Term + explanation — glossary, concept card *(planned)* |
| `checklist/` | Bullet/check marks list — tips, to-dos *(planned)* |
| `cta/` | Final slide — follow/save/link *(planned)* |
| `photo-overlay/` | Image background + text overlay *(planned, requires `allow_photos: true`)* |
| `bento/` | Asymmetric grid of cards — features, services *(planned)* |

Shared resources: `_shared/boilerplate.html`, `_shared/type-scales.md`, `_shared/safe-zones.md`.

*(planned)* archetypes fall back to custom HTML composition via the boilerplate. When a follow-up plan lands with all archetypes, this table updates.

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
