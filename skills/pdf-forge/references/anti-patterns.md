# Anti-Patterns Reference: What Makes PDFs Look AI-Sloppy

Self-check every generated PDF against this list. Each entry names the mistake, explains why it screams "AI-generated," and gives the concrete fix.

---

## Spacing Anti-Patterns

### Random margin/padding values
**Looks like:** `mt-3` next to `mt-7` next to `mt-5` with no logic behind the choices.
**Why it looks AI-generated:** Humans design with a spacing scale and stick to it. Random values signal no system, just token prediction filling in numbers.
**Fix:** Pick one Tailwind spacing scale and commit. Use `4 / 8 / 12 / 16` (i.e., `p-1 / p-2 / p-3 / p-4`) or `8 / 16 / 24 / 32` (`p-2 / p-4 / p-6 / p-8`). Never mix scales on the same page.

### Cramming content to fill the space
**Looks like:** Every square centimeter occupied. No breathing room between sections.
**Why it looks AI-generated:** AI tries to be "helpful" by maximizing content density. Professional design uses emptiness deliberately -- white space is a design element.
**Fix:** Apply generous section gaps with `py-10` or `py-12` between major blocks. Use `mb-6` minimum between content groups. If a page feels empty, that is fine -- resist the urge to fill it.

### Equal spacing everywhere
**Looks like:** `gap-4` between everything -- heading to subheading, subheading to body, body to next section. All identical.
**Why it looks AI-generated:** Uniform spacing destroys hierarchy. The eye cannot distinguish "related items" from "new section" when the gaps are the same.
**Fix:** Use tighter spacing within groups (`gap-1`, `gap-2`) and larger spacing between groups (`mt-8`, `mt-10`). Ratio should be at least 2:1 between inter-group and intra-group spacing.

### Mixing absolute and relative units
**Looks like:** `p-4` on one container, `style="margin: 18px"` on another, `gap-[1.5rem]` on a third.
**Why it looks AI-generated:** Inconsistent unit systems produce subtly misaligned layouts that feel "off" without the viewer knowing why.
**Fix:** Stay within Tailwind's spacing scale exclusively. Use arbitrary values (`gap-[value]`) only when the scale truly lacks what you need, and use `rem` when you do.

---

## Typography Anti-Patterns

### Too many font sizes
**Looks like:** `text-3xl`, `text-xl`, `text-lg`, `text-base`, and `text-sm` all on one page competing for attention.
**Why it looks AI-generated:** AI hedges by using slightly different sizes for everything. Professional design uses 2-3 sizes max per page with clear roles.
**Fix:** Establish a strict type scale per page: one size for headings (`text-2xl` or `text-3xl`), one for body (`text-sm` or `text-base`), one optional for captions/labels (`text-xs`). That is it.

### Body text too large
**Looks like:** `text-xl` or `text-lg` for paragraph text on an A4/letter page.
**Why it looks AI-generated:** AI defaults to larger text thinking it improves readability. On a fixed-size PDF, large body text looks like a grade school worksheet.
**Fix:** Use `text-sm` (14px) or `text-base` (16px) for body text. For dense documents (reports, proposals), `text-sm` is usually correct. Reserve `text-lg`+ for slide headlines only.

### No weight contrast
**Looks like:** Everything set to `font-normal` or everything set to `font-medium`. Headings and body text feel the same.
**Why it looks AI-generated:** Weight contrast is the primary way humans scan documents. Without it, the page reads as a wall of undifferentiated text.
**Fix:** Headings get `font-bold` or `font-semibold`. Body gets `font-normal`. Labels and metadata get `font-medium`. Ensure at least two weight steps between heading and body.

### Default tracking everywhere
**Looks like:** No `tracking-*` classes used at all. Large headings feel too loose, small captions feel too tight.
**Why it looks AI-generated:** Default letter-spacing works for body text but looks unrefined at display sizes. Neglecting it signals "nobody reviewed this."
**Fix:** Use the semantic tracking tokens defined in the template's `tailwind.config`: `tracking-heading` (-0.06em) for headings, `tracking-label` (-0.01em) for labels, `tracking-body` (-0.025em) for body text, `tracking-display` (-0.1em) for hero numbers. These values are calibrated from 5 production design systems (Figma, Stripe, Vercel, Framer, Linear). All tracking is negative — no production system uses positive letter-spacing.

### Bad line height
**Looks like:** Body text with `leading-none` (cramped) or `leading-loose` (floaty). Lines either collide or drift apart.
**Why it looks AI-generated:** AI often ignores line height or applies it inconsistently. Both extremes make text physically uncomfortable to read.
**Fix:** Body text: `leading-relaxed` (1.625) or `leading-normal` (1.5). Headings: `leading-tight` (1.25) or `leading-snug` (1.375). Never use `leading-none` on multi-line text.

### Lines too long without compensation
**Looks like:** Text spanning the full page width -- 90+ characters per line.
**Why it looks AI-generated:** Long lines are hard to track across. Professional documents always constrain line length.
**Fix:** Use `max-w-prose` (65ch) or `max-w-2xl` for body text blocks. If full-width is required (tables, multi-column), increase leading to `leading-relaxed` or `leading-loose`.

---

## Color Anti-Patterns

### Rainbow PDFs
**Looks like:** Blue header, green callout, orange accent, purple highlight, red badge -- all on one page.
**Why it looks AI-generated:** AI tries to make things "visually interesting" by adding color variety. The result looks like a children's textbook.
**Fix:** One primary accent color plus neutral grays. Maximum two accent colors across the entire document. Use `slate`, `zinc`, or `neutral` for text and backgrounds, one `blue/indigo/emerald` for accents.

### Gradient abuse
**Looks like:** Gradient backgrounds on headers, gradient text, gradient cards, gradient dividers. Gradients on everything.
**Why it looks AI-generated:** Gradients are AI's go-to trick for looking "designed." Overuse is the single most recognizable AI aesthetic.
**Fix:** Reserve gradients for one hero element maximum (e.g., the cover page header or a single key metric card). Everything else gets flat colors. When using gradients, keep them subtle -- two adjacent shades, not opposite ends of the spectrum.

### Low contrast text
**Looks like:** `text-gray-400` on a white background. `text-slate-300` on `bg-slate-700`. Text you have to squint to read.
**Why it looks AI-generated:** AI optimizes for "looking soft" and overshoots into illegibility. It confuses "subtle" with "invisible."
**Fix:** Body text minimum: `text-gray-700` on white, `text-gray-200` on dark backgrounds. Secondary text minimum: `text-gray-500` on white. Test by imagining a slightly dim screen or a printed page.

### Over-visible borders
**Looks like:** `border-2 border-gray-400` around every card and section. Thick lines becoming a visual grid.
**Why it looks AI-generated:** AI uses borders as the primary grouping mechanism instead of whitespace. The result looks like a wireframe, not a finished design.
**Fix:** Prefer spacing and background color for grouping. When borders are needed, use `border border-gray-200` (1px, very light). Use `divide-y divide-gray-100` for lists. Borders should be felt, not seen.

### Purposeless background colors
**Looks like:** Random sections with `bg-blue-50`, `bg-green-50`, `bg-yellow-50` that carry no semantic meaning.
**Why it looks AI-generated:** AI assigns colors decoratively rather than meaningfully. Readers try to decode what the color means and find nothing.
**Fix:** Background colors must signal something: `bg-blue-50` for info/context, `bg-amber-50` for warnings, `bg-slate-50` for de-emphasized content. If a color does not mean anything, remove it and use white space instead.

---

## Layout Anti-Patterns

### Supermarket list syndrome
**Looks like:** Everything is either a bullet list or a plain `<table>`. Page after page of the same two structures.
**Why it looks AI-generated:** Bullet lists and tables are the lowest-effort layout. AI defaults to them because they require no spatial reasoning.
**Fix:** Use cards (`rounded-lg bg-white shadow-sm p-6`), metric grids (`grid grid-cols-3`), icon-label pairs, timelines, or sidebars. Choose the layout that matches the content's nature, not the easiest to generate.

### No visual grouping
**Looks like:** Content items float in sequence with no spatial relationship. A heading, then text, then an image, then more text, with no clear containment.
**Why it looks AI-generated:** AI generates content linearly (top to bottom). Humans organize content spatially (groups, columns, regions).
**Fix:** Use `grid` and `flex` to create explicit regions. Group related items in a shared container with `bg-slate-50 rounded-lg p-6`. Add section dividers with `border-t border-gray-100` when topics change.

### Symmetry abuse
**Looks like:** Three identical cards side by side, four identical boxes below, two identical columns under that. Everything perfectly mirrored.
**Why it looks AI-generated:** Symmetry at every level feels mechanical. Real design uses asymmetry to create visual interest and hierarchy.
**Fix:** Vary card sizes -- make one card span 2 columns (`col-span-2`) while others span 1. Use a 2/3 + 1/3 split (`grid-cols-3` with `col-span-2` + `col-span-1`) instead of 1/2 + 1/2. Let one element be the hero.

### No focal point
**Looks like:** Every element has the same size, weight, color, and spacing. Nothing draws the eye first.
**Why it looks AI-generated:** AI distributes visual weight evenly to seem "balanced." The result is that nothing is important, so nothing is read.
**Fix:** Pick one element per page to be dominant: a large number (`text-5xl font-bold`), a hero image, or a pull quote. Make it 2-3x larger than surrounding content. Reduce emphasis on everything else.

### Content touching edges
**Looks like:** Text and elements running to the very edge of the page with no safety margin.
**Why it looks AI-generated:** AI sometimes forgets that PDFs get printed or displayed with system chrome. Content at the edge gets clipped.
**Fix:** Apply `p-10` or `p-12` to the page container. For print-safe margins, use `p-16`. Never let content sit closer than 40px from any edge.

---

## Content Anti-Patterns

### Generic filler text
**Looks like:** "We are committed to delivering innovative solutions that drive value for stakeholders."
**Why it looks AI-generated:** This is the single most obvious AI tell. Vague corporate language with no specifics signals a model filling space with plausible tokens.
**Fix:** Use concrete specifics: names, numbers, dates, percentages. Replace "innovative solutions" with what the solution actually is. If you lack real data, use realistic placeholders with a `[placeholder]` marker.

### Repetitive sentence structure
**Looks like:** "Our team focuses on X. Our approach ensures Y. Our platform delivers Z." Same subject-verb pattern repeating.
**Why it looks AI-generated:** Pattern repetition is a hallmark of autoregressive generation. Humans naturally vary sentence length, structure, and rhythm.
**Fix:** Vary sentence openers. Mix short declarative statements with longer compound sentences. Start some sentences with the object, others with a qualifier. Break monotony with a question or a fragment.

### Over-explaining the obvious
**Looks like:** A pie chart followed by "The pie chart above shows the distribution of revenue across segments."
**Why it looks AI-generated:** AI narrates what visual elements already communicate, padding word count without adding insight.
**Fix:** If a visual communicates the data, add only the insight: "Services grew 23% YoY, now the largest segment." Never describe what a chart or graphic shows -- describe what it means.

### Numbers buried in text
**Looks like:** "Revenue increased to $4.2 million, representing a 34% increase from the previous quarter."
**Why it looks AI-generated:** AI defaults to prose for everything, including data that has more impact as a visual element.
**Fix:** Display key numbers as large visual elements: `text-4xl font-bold` with a label below in `text-sm text-gray-500`. Use metric cards in a grid. Reserve prose for narrative context around the numbers.

### Paragraphs replacing visuals
**Looks like:** A long paragraph explaining a process that should be a flowchart, or describing a comparison that should be a table.
**Why it looks AI-generated:** AI is a text generator, so it defaults to text even when another format communicates better.
**Fix:** Before writing a paragraph, ask: would a timeline, comparison grid, icon grid, or diagram communicate this faster? If yes, build the visual using Tailwind layout utilities instead.

---

## Structural Anti-Patterns

### Every page looks identical
**Looks like:** Page 1: centered heading + three cards. Page 2: centered heading + three cards. Page 3: centered heading + three cards.
**Why it looks AI-generated:** Template repetition is the clearest signal of generation without design thought. Each page was produced by the same prompt-completion pattern.
**Fix:** Alternate between 2-3 layout patterns: full-width hero, two-column split, grid of metrics, single-focus spotlight. Never use the same layout for three consecutive pages.

### No rhythm or variety
**Looks like:** Uniform visual density on every page. No moments of pause, no moments of emphasis. The eye never rests.
**Why it looks AI-generated:** AI generates content at constant density. Human designers create rhythm -- dense sections followed by spacious ones.
**Fix:** Follow a "breathe" pattern: content-heavy page, then a spacious page. Insert a pull-quote page, a single-stat page, or a visual break between dense sections. Treat pacing like chapters, not filler.

### Missing wayfinding
**Looks like:** No section labels, no page numbers, no category tags, no progress indicators. The reader has no sense of position within the document.
**Why it looks AI-generated:** AI focuses on content and forgets document-level navigation. The result feels like a content dump rather than a structured artifact.
**Fix:** Add section labels in `text-xs uppercase tracking-label text-gray-400 font-medium`. Include page numbers. Use a consistent header or sidebar stripe showing the current section. Every page should answer "where am I in this document?"

### Too much content per page
**Looks like:** Tiny text, cramped spacing, and 800+ words on a single page because "it all fits."
**Why it looks AI-generated:** AI optimizes for information completeness over readability. It does not intuitively understand that splitting content improves comprehension.
**Fix:** If a page needs `text-xs` to fit everything, split it into two pages. Target 150-250 words per page for presentations, 400-500 for documents. Generously split rather than aggressively compress.

---

## Quick Self-Check

Before finalizing any PDF, scan for these five highest-priority signals:

1. **Gradient count** -- more than one? Remove extras.
2. **Color count** -- more than two accent colors? Simplify.
3. **Layout repetition** -- three+ consecutive pages with the same structure? Vary them.
4. **Spacing consistency** -- are you using values from one scale? Audit `mt-`, `mb-`, `p-`, `gap-` classes.
5. **Focal point** -- can you point to the single most important element on each page? If not, create one.
