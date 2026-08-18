# pdf-forge

Professional PDF generation for AI coding agents. Slides and documents with Vercel/Stripe-quality aesthetics using pure HTML + Tailwind CSS. Works with Warp, Claude Code, Cursor, Codex, Augment Code, Gemini, and more.

## The Problem

AI-generated PDFs look recognizably generic: inconsistent spacing, flat typography, random colors, endless bullet lists. pdf-forge solves this by encoding a complete design system — typography scales, spacing grids, color palettes, and layout patterns — into a Claude Code skill.

## What It Does

- Generates **slide presentations** (16:9, 1920x1080), **A4 documents**, and **Instagram social** (post / carousel / story) from any content
- Uses static HTML + Tailwind CSS via CDN — no React, no build step, no component libraries
- Renders to PDF via Playwright (screenshots for slides, native PDF for documents), with optional **PPTX export** via `python-pptx`
- Includes 16 ready-to-use templates (8 slides + 7 documents + 1 social cover; more social archetypes planned)
- Applies a professional design system: zinc backbone, typographic contrast, restrained accents, overflow guard for fixed-viewport formats
- Supports brand customization (colors, fonts, theme) via per-project `.claude/pdf-forge.local.md` and bundled brand presets in `assets/themes/`

## Installation

### Cross-platform (recommended)

Installs the skill for **all** detected agents — Warp, Claude Code, Cursor, Codex, Augment Code, Gemini, and more:

```bash
git clone https://github.com/syx-labs/pdf-forge.git
cd pdf-forge
bun install
./install.sh            # creates symlinks + sets PDF_FORGE_HOME
```

Reload your shell (`source ~/.zshrc`) or open a new terminal. The skill is now available as `/pdf-forge` in every supported agent.

```bash
# Preview what will be created (no changes)
./install.sh --dry-run

# Remove all symlinks and env var
./install.sh --uninstall
```

**How it works:** The installer creates a canonical symlink at `~/.agents/skills/pdf-forge` pointing to the project's skill directory, then creates relative symlinks from each platform (`~/.claude/skills/`, `~/.cursor/skills/`, etc.) to the canonical location. It also exports `PDF_FORGE_HOME` in your shell profile so scripts can locate the project root.

**Supported platforms:**

- Warp (`~/.agents/skills/`, `~/.warp/skills/`)
- Claude Code (`~/.claude/skills/`)
- Cursor (`~/.cursor/skills/`)
- Codex (`~/.codex/skills/`)
- Augment Code (`~/.augment/skills/`)
- Gemini CLI (`~/.gemini/skills/`)
- GitHub Copilot (`~/.copilot/skills/`)
- Factory (`~/.factory/skills/`)
- OpenCode (`~/.opencode/skills/`)

Platforms not installed on your machine are automatically skipped.

### Claude Code (plugin)

Alternatively, install as a Claude Code plugin:

```bash
/plugin marketplace add syx-labs/pdf-forge
/plugin install pdf-forge@syx-labs-plugins
```

### Claude Desktop (MCP server)

One command sets up everything — installs Playwright/Chromium and configures Claude Desktop:

```bash
npx pdf-forge-mcp setup
```

Then restart Claude Desktop. The pdf-forge tool and design system resources will be available.

### Development

```bash
git clone https://github.com/syx-labs/pdf-forge.git
cd pdf-forge
bun install
bun run scripts/setup.ts
```

## Usage

Ask Claude to create any PDF:

- "Create a pitch deck about our product"
- "Generate a financial report for Q4"
- "Make a professional proposal for the client"
- "Design slides for the investor meeting"

The skill automatically:
1. Detects the format (slides vs documents)
2. Selects appropriate layouts from the template catalog
3. Generates self-contained HTML pages with Tailwind CSS
4. Renders to PDF via Playwright

### Typed registry and governed data

The free-form HTML workflow remains supported, including the legacy MCP
`generate_pdf` tool. The typed registry is an additive path for reusable,
schema-validated components:

```bash
bun run bin/pdf-forge.ts registry list --json
bun run bin/pdf-forge.ts registry inspect executive-report --json
bun run bin/pdf-forge.ts compose executive-report \
  --data ./snapshot.json \
  --theme ivory-editorial \
  --output ./report.pdf \
  --receipt ./report.receipt.json
```

`compose` keeps data acquisition separate from visual composition and validates a
versioned read-only snapshot before binding and rendering it. The MCP server adds
read-only registry discovery plus `compose_pdf`; `generate_pdf` retains its raw
HTML contract for existing clients.

The DeepSQL HTTP adapter is optional and disabled by default. A trusted host must
own its fixed endpoint and authentication, register it explicitly, allowlist query
IDs, and approve non-empty parameters. Documents cannot supply raw SQL, provider
configuration, endpoints, or credentials. See
[`docs/integrations/deepsql.md`](docs/integrations/deepsql.md) for the contract and
threat model.

Inspect effective capabilities without exposing configured values:

```bash
bun run bin/pdf-forge.ts doctor --json
```

Generate the canonical component gallery from registry examples and real
Playwright output:

```bash
bun run scripts/generate-gallery.ts --output .artifacts/registry-gallery
```

The generated gallery is evidence, not committed source. See
[`docs/registry/README.md`](docs/registry/README.md) for its layout and fail-closed
rules.

## Brand Customization

Create `.claude/pdf-forge.local.md` in your project:

```yaml
---
brand:
  name: "Your Company"
  primary: "purple-500"
  secondary: "orange-500"
  theme: "dark"
font:
  url: "https://fonts.googleapis.com/css2?family=Inter:wght@100..900"
  family: "Inter"
# Optional: Instagram composition hints (read by Claude, not by the pipeline)
social:
  preset: "dark-editorial"      # which assets/themes/<name>.yaml Claude mirrors
  accent_gradient: "from-emerald-400 to-cyan-400"  # override preset gradient
  allow_photos: false           # gate photo-overlay archetype
  brand_handle: "@yourhandle"
  default_footer: true
---
```

Without this file, defaults apply: dark theme, Inter font, purple/orange accents.

The `social:` block is a **composition contract for Claude**, not a runtime config the pipeline parses. Claude reads it when generating HTML for the social format — picking the preset's palette and fonts, honoring overrides, and respecting the `allow_photos` gate. The renderer itself only reads `data-social-format` from the `<body>` tag to pick a viewport. See `assets/themes/README.md` for the preset list and `skills/pdf-forge/SKILL.md` "Workflow — Social" for how Claude consumes each field.

## Templates

### Slides (16:9)

| Template | Use Case |
|----------|----------|
| Cover | Opening slide |
| Impact Stats | Problem/opportunity with big numbers |
| Bento Grid | Features, modules, services |
| Split Screen | Cost vs return, before vs after |
| Timeline | Roadmap, phases |
| Comparison | Us vs competitors |
| Quote | Testimonials |
| CTA | Call to action, contact |

### Documents (A4)

| Template | Use Case |
|----------|----------|
| Doc Cover | Report/proposal cover |
| Executive Summary | Key metrics + summary |
| Content Page | Narrative text |
| Data Table | Financial/metric tables |
| Two-Column | Parallel information |
| Visual Full | Charts, diagrams |
| Appendix | Supplementary data |

### Social — Instagram (various aspect ratios)

| Format | Viewport | Use Case |
|--------|----------|----------|
| post-1-1 | 1080×1080 | Square feed post |
| post-4-5 | 1080×1350 | Portrait feed post (default for editorial) |
| carousel-1-1 | 1080×1080 | Square carousel (N slides) |
| carousel-4-5 | 1080×1350 | Portrait carousel |
| story | 1080×1920 | Story / Reels cover |

Only `cover` ships as a proper template. The remaining archetype vocabulary (mega-stat, steps, quote, before-after, definition, checklist, cta, photo-overlay, bento) lives in `skills/pdf-forge/references/social-archetypes-planned.md` — compose custom HTML from `assets/templates/social/_shared/boilerplate.html` until they ship.

## Design Philosophy

- **Zinc backbone**: 90% of the design uses zinc shades. Color is an accent, not a foundation.
- **Semantic tracking tokens**: Four tracking levels calibrated from Figma, Stripe, Vercel, Framer, and Linear: `tracking-display` (-0.1em), `tracking-heading` (-0.06em), `tracking-body` (-0.025em), `tracking-label` (-0.01em). All negative -- positive letter-spacing is the top marker of AI-generated PDFs.
- **One accent, one moment**: Gradient color appears only on the highest-impact element per page.
- **Geometric spacing scale**: Spacing follows a geometric progression (4, 8, 12, 16, 24, 32, 48, 64, 80, 96px). No arbitrary values.
- **Raw HTML**: No component libraries. Flat DOM for predictable Playwright rendering.

## Scripts

| Command | What it does |
|---|---|
| `bun run render <pages-dir>` | Render HTML → PNG/PDF (auto-detects format) |
| `bun run merge <rendered-dir>` | Merge rendered output into a single PDF |
| `bun run pptx <rendered-dir>` | Build a full-bleed PPTX from rendered PNGs (requires `uv`) |
| `bun run gen-images <project> <manifest.yaml>` | Generate deck imagery in parallel via Codex imagegen |
| `bun run psd:deck <file.psd>` | One-shot: `.psd` → editable deck → `deck.pdf` (extract+slides+render+merge; needs `uv`+Chromium) |
| `bun run psd:extract <file.psd>` | Extract a `.psd` (composite + plates + texts + design metrics) via psd-tools (requires `uv`) |
| `bun run psd:slides <extract-dir>` | Turn a PSD extract into editable `slides` HTML (plate + editable text) |

PSD import reconstructs a Photoshop file as a **pixel-perfect background + editable HTML text**
deck — text weight/alignment are measured from the ink (no `EngineData` needed). `psd:deck` does
it in one shot. See [`skills/pdf-forge/references/psd-import.md`](skills/pdf-forge/references/psd-import.md).

## Requirements

- [Bun](https://bun.sh) runtime
- Playwright (installed via setup script)
- Internet connection (Tailwind CDN, Google Fonts)
- Optional: `uv` (https://docs.astral.sh/uv/) for PPTX export and PSD import
- Optional: `codex` CLI for the parallel image generator

## License

MIT
