# Document Layouts Reference

This document catalogs all 7 document templates in `assets/templates/documents/`. Use it to select the right layout for each page in a multi-page document, understand what to replace, and compose coherent page sequences.

All templates render at A4 dimensions (`w-[210mm] min-h-[297mm]`) on a `bg-zinc-950` background using Inter from Google Fonts. Page numbers appear bottom-right in `text-xs text-zinc-500 font-mono`. Typography runs ~40% smaller than slide templates to accommodate denser reading content.

---

## Layout Catalog

### 1. Doc Cover (`doc-cover.html`)

**When to use.** First page of any report, proposal, whitepaper, or formal document. Sets the brand, title, and document metadata.

**Structure.** Full-page dark background with two decorative glow orbs (purple top-right, orange bottom-left). Three vertical zones stacked with `flex flex-col justify-between`:

- **Top**: Brand name in `font-mono uppercase tracking-label text-zinc-500 text-xs`
- **Center**: Title (`text-5xl font-semibold`), gradient accent line (w-32, h-1, purple-to-orange), subtitle (`text-xl text-zinc-400 font-light`)
- **Bottom**: Metadata row split with `flex items-start justify-between` -- left side has author and date labels, right side has version and classification. All metadata uses `font-mono text-xs` with `text-zinc-600` labels and `text-zinc-400` values, separated by a full-width `h-px bg-zinc-800` divider above.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Company/Brand Name -->` | Brand or company name, top-left |
| `<!-- REPLACE: Document Title -->` | Hero `h1` text |
| `<!-- REPLACE: Document Subtitle -->` | Descriptive subtitle paragraph |
| `<!-- REPLACE: Author Name -->` | Author name value |
| `<!-- REPLACE: Date -->` | Document date |
| `<!-- REPLACE: Version -->` | Version number (e.g., "v2.1") |
| `<!-- REPLACE: Classification -->` | Confidentiality label or similar |

**Composition.** Always position as page 1. Never reuse mid-document. This is the only template with decorative glow elements.

---

### 2. Executive Summary (`executive-summary.html`)

**When to use.** Opening page after cover. Decision-maker summary with key metrics and high-level narrative. Designed for readers who only read one page.

**Structure.** Single-column layout with `flex flex-col min-h-[297mm] p-16`. Four stacked sections:

- **Section label**: Orange mono text (`text-xs font-mono uppercase tracking-label text-orange-500`)
- **Page title**: `text-4xl font-semibold text-zinc-100`
- **Highlight cards**: `grid grid-cols-3 gap-4` containing three metric cards. Each card uses `bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6` with a big number (`text-3xl font-bold`), a label (`text-sm font-medium text-zinc-300`), and a description (`text-sm text-zinc-500`)
- **Summary text**: `space-y-6` container with paragraphs in `text-base text-zinc-400 leading-relaxed`

A `flex-1` spacer pushes the page number to the bottom.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Category label (e.g., "Executive Summary") |
| `<!-- REPLACE: Page Title -->` | Page heading |
| `<!-- REPLACE: Highlight Card 1 -->` | First metric: number, label, description |
| `<!-- REPLACE: Highlight Card 2 -->` | Second metric |
| `<!-- REPLACE: Highlight Card 3 -->` | Third metric |
| `<!-- REPLACE: Summary Paragraph 1-3 -->` | Summary body paragraphs (use 2-4) |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** Place as page 2 immediately after Doc Cover. Summarize the entire document -- a reader who stops here should understand the key numbers and recommendation.

---

### 3. Content Page (`content-page.html`)

**When to use.** Main body text. Narrative sections, detailed explanations, methodology descriptions, or any content requiring full heading hierarchy and structured prose.

**Structure.** Single-column layout with `p-16`. Supports the full heading hierarchy:

- **Section label** (optional): `text-xs font-mono uppercase tracking-label text-zinc-500` (e.g., "Section 02 -- Architecture")
- **H1**: `text-4xl font-semibold tracking-heading text-zinc-100 mb-6`
- **H2**: `text-2xl font-semibold tracking-heading text-zinc-100 mt-10 mb-4`
- **H3**: `text-xl font-medium text-zinc-200 mt-8 mb-3`
- **Body paragraphs**: `text-base text-zinc-400 leading-relaxed mb-6`
- **Styled list items**: `border-l-2 border-zinc-700 pl-4` with bold term in `text-zinc-300 font-medium` followed by description in `text-zinc-400`. List container uses `space-y-2 ml-6 mb-6`.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Section number and name |
| `<!-- REPLACE: Page Heading -->` | H1 title |
| `<!-- REPLACE: Introductory Paragraph -->` | Opening body text |
| `<!-- REPLACE: Additional Paragraph -->` | Continuation text |
| `<!-- REPLACE: Subsection Heading -->` | H2 title |
| `<!-- REPLACE: Subsection Body -->` | H2 body text |
| `<!-- REPLACE: List Items -->` | Border-left styled list entries |
| `<!-- REPLACE: Topic Heading -->` | H3 title |
| `<!-- REPLACE: Topic Body -->` | H3 body text |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** The workhorse template. Use for 2-5 consecutive pages in any document. Vary heading depth and list usage across pages to avoid monotony. Omit the section label on continuation pages within the same section.

---

### 4. Data Table (`data-table.html`)

**When to use.** Financial projections, pricing breakdowns, metrics comparisons, specifications, or any structured tabular data. Includes an optional highlight metric card below the table.

**Structure.** Single-column layout with `p-16`. Three main elements:

- **Header**: Section label (`text-xs font-mono uppercase tracking-label text-zinc-500`) and page title (`text-4xl`)
- **Table**: Div-based grid wrapped in `rounded-xl border border-zinc-800 overflow-hidden`. Header row uses `bg-zinc-900` with `text-xs font-mono uppercase tracking-label text-zinc-400` columns. Data rows use `grid grid-cols-N` with `border-b border-zinc-800/50`. Alternating rows get `bg-zinc-900/30`. Numeric values are `text-right font-mono`. The total row uses `border-t-2 border-zinc-700 bg-zinc-900/50` with `font-semibold text-white`.
- **Highlight card** (optional): `bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6` with a gradient icon placeholder, metric name, big number, and description.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Section number and name |
| `<!-- REPLACE: Page Title -->` | Table page heading |
| `<!-- REPLACE: Table Header Columns -->` | Column headers (adjust `grid-cols-N` as needed) |
| `<!-- REPLACE: Table Data Rows -->` | All data rows (match column count) |
| `<!-- REPLACE: Total Row -->` | Summary/total row |
| `<!-- REPLACE: Highlight Card -->` | Below-table metric callout (remove if not needed) |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** Place after Content Pages that reference the data, or after Executive Summary for financial-heavy documents. Keep to 7-8 data rows maximum per page -- split into multiple Data Table pages if needed. Pair with Visual Full for graphical representation of the same data.

---

### 5. Two-Column (`two-column.html`)

**When to use.** Side-by-side comparison or parallel information. Technical vs commercial scope, requirements vs deliverables, current state vs proposed state, or any content that benefits from juxtaposition.

**Structure.** Layout with `flex flex-col justify-between min-h-[297mm] p-16`. Header section followed by a `grid grid-cols-2 gap-8`:

- **Header**: Section label, page heading (`text-4xl`), and full-width `h-px bg-zinc-800` divider
- **Left column**: Sub-heading (`text-xl font-medium text-zinc-200`), body paragraphs, and an optional data block (`bg-zinc-900/50 border border-zinc-800 rounded-xl p-5`) with a bulleted list using `&#9679;` dot characters
- **Right column**: `border-l border-zinc-800 pl-8` for vertical divider effect. Same sub-heading and paragraph structure, with an optional data block containing `flex justify-between` rows separated by `h-px bg-zinc-800/60` dividers -- useful for line-item pricing or key-value pairs

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Section number and name |
| `<!-- REPLACE: Page Heading -->` | Page title spanning both columns |
| `<!-- REPLACE: Left Column Sub-heading -->` | Left column H2 |
| `<!-- REPLACE: Left Column Body -->` | Left column paragraphs |
| `<!-- REPLACE: Left Column Data Block -->` | Left column card with list |
| `<!-- REPLACE: Left Column Additional Text -->` | Left column closing text |
| `<!-- REPLACE: Right Column Sub-heading -->` | Right column H2 |
| `<!-- REPLACE: Right Column Body -->` | Right column paragraphs |
| `<!-- REPLACE: Right Column Data Block -->` | Right column card with line items |
| `<!-- REPLACE: Right Column Additional Text -->` | Right column closing text |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** Place mid-document where comparison adds clarity. Works well after Content Pages to break visual rhythm. Avoid stacking two consecutive Two-Column pages -- alternate with Content Page or Data Table between them.

---

### 6. Visual Full (`visual-full.html`)

**When to use.** Charts, diagrams, architecture drawings, screenshots, or any data visualization that needs full-width display with contextual interpretation.

**Structure.** Layout with `flex flex-col justify-between min-h-[297mm] p-16`. Top-aligned content:

- **Header**: Section label, page heading (`text-4xl`), full-width divider
- **Visual area**: `bg-zinc-900/50 border border-zinc-800 rounded-2xl` container with `min-height: 520px`. Default content is a placeholder dot grid with label text. Replace with inline SVG, `<img>` tag (base64 or URL), or Tailwind-built chart.
- **Caption**: `text-sm text-zinc-500 mt-4` with figure number and description (e.g., "Figure 5.1 -- ...")
- **Interpretation**: `text-base text-zinc-400 leading-relaxed` paragraph explaining what the visual shows and why it matters

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Section number and name |
| `<!-- REPLACE: Page Heading -->` | Visual page title |
| `<!-- REPLACE: Visual Area -->` | The entire placeholder -- insert SVG, img, or built chart |
| `<!-- REPLACE: Caption -->` | Figure number and description |
| `<!-- REPLACE: Interpretation paragraph -->` | Analysis text explaining the visual |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** Place after the Content Page or Data Table that references this visual. Always include both caption and interpretation -- never leave a chart without written context. Limit to one visual per page for readability.

---

### 7. Appendix (`appendix.html`)

**When to use.** Supplementary material: glossaries, methodology notes, configuration parameters, source references, or any dense reference content that supports but does not drive the main narrative.

**Structure.** Layout with `p-12` (tighter than other templates' `p-16`). Uses smaller typography throughout:

- **Section label**: `text-xs font-mono uppercase tracking-label text-zinc-500` (e.g., "Appendix A")
- **Heading**: `text-2xl font-semibold` (smaller than the standard `text-4xl`)
- **Subsection headings**: `text-lg font-medium text-zinc-200`
- **Body text**: `text-sm text-zinc-400 leading-relaxed`
- **Definition list**: Term in `text-sm font-medium text-zinc-300`, definition in `text-sm text-zinc-400`, separated by `h-px bg-zinc-800/60` dividers
- **Native `<table>`**: Uses actual `<table>` element with `text-sm` body. Header cells use `text-xs font-mono uppercase tracking-label text-zinc-500 font-normal`. Data cells use `font-mono text-xs text-zinc-300` for parameter names and `text-sm text-zinc-400` for descriptions.
- **References**: `text-xs text-zinc-500 font-mono` entries with bracketed numbering

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Appendix identifier (e.g., "Appendix A", "Appendix B") |
| `<!-- REPLACE: Heading -->` | Appendix title |
| `<!-- REPLACE: Subsection Heading -->` | Each subsection title (glossary, methodology, etc.) |
| `<!-- REPLACE: Definition list -->` | Term/definition pairs |
| `<!-- REPLACE: Methodology body -->` | Methodology description paragraphs |
| `<!-- REPLACE: Table -->` | Parameter or specification table |
| `<!-- REPLACE: Reference notes -->` | Numbered reference entries |
| `<!-- REPLACE: Page Number -->` | Page number string |

**Composition.** Always place as the last page(s) of a document. Use multiple Appendix pages for different categories (Appendix A, B, C). This is the only template that uses `p-12` padding and a native `<table>` element -- do not mix these into other templates.

---

## Composition Patterns

Use these sequences as starting points. Add or remove pages based on content depth, but maintain the structural arc: cover, summarize, explain, prove with data, close with reference material.

### Business Proposal (7-9 pages)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Doc Cover | Brand + proposal title |
| 2 | Executive Summary | Key numbers and recommendation |
| 3-4 | Content Page (x2) | Problem analysis, proposed approach |
| 5 | Two-Column | Technical scope vs commercial scope |
| 6 | Data Table | Pricing breakdown and timeline |
| 7 | Content Page | Terms, conditions, next steps |
| 8-9 | Appendix | References, methodology, glossary |

### Technical Report (8-12 pages)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Doc Cover | Report title + period |
| 2 | Executive Summary | Key findings and metrics |
| 3-5 | Content Page (x3) | Analysis, architecture, methodology |
| 6 | Visual Full | Primary chart or diagram |
| 7 | Data Table | Supporting metrics |
| 8-9 | Content Page (x2) | Conclusions, recommendations |
| 10-12 | Appendix (x1-3) | Glossary, config parameters, references |

### Financial Report (7-10 pages)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Doc Cover | Report title + fiscal period |
| 2 | Executive Summary | Revenue, margin, and growth highlights |
| 3-5 | Data Table (x2-3) | Revenue breakdown, cost analysis, projections |
| 6 | Visual Full | Trend chart or comparison visualization |
| 7 | Content Page | Commentary and forward-looking statements |
| 8-10 | Appendix (x1-3) | Accounting methodology, definitions, sources |

### Project Plan (6-8 pages)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Doc Cover | Project name + version |
| 2 | Content Page | Objectives, scope, success criteria |
| 3 | Two-Column | Deliverables vs responsibilities |
| 4 | Data Table | Timeline with milestones and budgets |
| 5 | Content Page | Risk analysis and mitigation |
| 6 | Visual Full | Architecture diagram or Gantt representation |
| 7-8 | Appendix | Technical specs, team matrix, references |

---

## Document-Specific Notes

### Page sizing and breaks

All pages use `w-[210mm] min-h-[297mm]` as their outermost container. When generating a multi-page document as a single HTML file, add `page-break-before: always` as an inline style on each page container after the first.

### Page numbers

Use `text-xs text-zinc-500 font-mono` aligned to the right at the bottom of every page except the cover. Number pages sequentially starting from 02 on the Executive Summary. The cover page has no page number.

### Spacing differences from slides

- Paragraph spacing: `space-y-4` to `space-y-6` (slides use `space-y-8` or larger)
- Body text: `text-base` (slides use `text-xl` to `text-2xl`)
- Headings: `text-4xl` for H1 (slides use `text-7xl` to `text-8xl`)
- Padding: `p-16` standard, `p-12` for Appendix (slides use larger padding)

### Adjusting Data Table column count

Change `grid-cols-5` in both the header and all data rows. Keep numeric columns `text-right font-mono`. Keep the first column (labels) as `text-left text-zinc-300`. Keep the last column (totals) as `text-zinc-100 font-medium`.

### Adjusting Executive Summary metric count

- **2 metrics**: Change to `grid-cols-2`. Remove one card.
- **4 metrics**: Change to `grid-cols-4 gap-3`. Reduce number to `text-2xl` and description to `text-xs` to prevent overflow.
- **1 metric**: Remove the grid. Use a single centered card with the number at `text-4xl`.

### Removing optional elements

- Doc Cover classification label: delete the span if not needed.
- Data Table highlight card: remove the entire `bg-zinc-900/50` div below the table.
- Content Page section label: remove the span if continuing a section from the previous page.
- Two-Column data blocks: replace with additional paragraphs or remove entirely.

---

## Quick Selection Guide

| You need to... | Use this layout |
|----------------|----------------|
| Open the document with brand and metadata | Doc Cover |
| Summarize the whole document in one page | Executive Summary |
| Write detailed narrative text | Content Page |
| Present structured tabular data | Data Table |
| Compare two sides of information | Two-Column |
| Display a chart, diagram, or screenshot | Visual Full |
| Add dense reference material at the end | Appendix |
