# pdf-forge

Professional PDF generation for Claude Code. Slides and documents with Vercel/Stripe-quality aesthetics using pure HTML + Tailwind CSS.

## The Problem

AI-generated PDFs look recognizably generic: inconsistent spacing, flat typography, random colors, endless bullet lists. pdf-forge solves this by encoding a complete design system — typography scales, spacing grids, color palettes, and layout patterns — into a Claude Code skill.

## What It Does

- Generates **slide presentations** (16:9, 1920x1080) and **A4 documents** from any content
- Uses static HTML + Tailwind CSS via CDN — no React, no build step, no component libraries
- Renders to PDF via Playwright (screenshots for slides, native PDF for documents)
- Includes 15 ready-to-use templates (8 slides + 7 documents)
- Applies a professional design system: zinc backbone, typographic contrast, restrained accents
- Supports brand customization (colors, fonts, theme)

## Installation

### Claude Code (plugin)

Add the marketplace and install:

```bash
# Add marketplace
/plugin marketplace add syxlabs/pdf-forge

# Install
/plugin install pdf-forge@syxlabs-plugins
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
git clone https://github.com/syxlabs/pdf-forge.git
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
---
```

Without this file, defaults apply: dark theme, Inter font, purple/orange accents.

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

## Design Philosophy

- **Zinc backbone**: 90% of the design uses zinc shades. Color is an accent, not a foundation.
- **Semantic tracking tokens**: Four tracking levels calibrated from Figma, Stripe, Vercel, Framer, and Linear: `tracking-display` (-0.1em), `tracking-heading` (-0.06em), `tracking-body` (-0.025em), `tracking-label` (-0.01em). All negative -- positive letter-spacing is the top marker of AI-generated PDFs.
- **One accent, one moment**: Gradient color appears only on the highest-impact element per page.
- **Geometric spacing scale**: Spacing follows a geometric progression (4, 8, 12, 16, 24, 32, 48, 64, 80, 96px). No arbitrary values.
- **Raw HTML**: No component libraries. Flat DOM for predictable Playwright rendering.

## Requirements

- [Bun](https://bun.sh) runtime
- Playwright (installed via setup script)
- Internet connection (Tailwind CDN, Google Fonts)

## License

MIT
