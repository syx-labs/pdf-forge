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
