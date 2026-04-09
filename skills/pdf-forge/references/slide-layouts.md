# Slide Layouts Reference

This document catalogs all 8 slide templates in `assets/templates/slides/`. Use it to select the right layout for each position in a deck, understand what to replace, and compose coherent presentation sequences.

All templates render at 1920x1080 pixels on a `bg-zinc-950` background using Inter from Google Fonts. Every template includes decorative glow elements and follows the design system's dark-mode visual language.

---

## Layout Catalog

### 1. Cover (`cover.html`)

**When to use.** First slide of any presentation. Sets the brand, title, and context for everything that follows.

**Structure.** Full-bleed dark background with two decorative glow orbs (purple top-right, orange bottom-left). Three vertical zones stacked with `flex flex-col justify-between`:

- **Top**: Brand name in `font-mono uppercase tracking-label text-zinc-500 text-sm`
- **Center**: Gradient accent line (4px, purple-to-orange), hero title (`text-8xl`), subtitle (`text-3xl`)
- **Bottom**: Author and date separated by a pipe, plus an optional label (e.g., "Confidencial")

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Company Name -->` | Brand or company name, top-left |
| `<!-- REPLACE: Presentation Title -->` | Hero `h1` text |
| `<!-- REPLACE: Presentation Subtitle -->` | Descriptive subtitle paragraph |
| `<!-- REPLACE: Author Name -->` | Presenter or author name |
| `<!-- REPLACE: Date -->` | Presentation date |
| `<!-- REPLACE: Additional Info -->` | Confidentiality label, version, or similar |

**Composition.** Always position as slide 1. Never reuse mid-deck.

---

### 2. Impact Stats (`impact-stats.html`)

**When to use.** Problem statements, market opportunity data, performance metrics, or any slide where big numbers need to hit hard.

**Structure.** Vertically centered content with a subtle background gradient. Three layers:

- **Section label**: Orange mono text (`text-orange-500`)
- **Hero heading**: `text-7xl` main claim or problem statement
- **Stats grid**: `grid grid-cols-3 gap-12` with three stat blocks

Each stat block has a `border-l-4` left accent, a big number (`text-8xl font-bold`), a title (`text-2xl font-medium`), and a description (`text-xl text-zinc-500`). The first two blocks use `border-zinc-800` with `text-zinc-300` numbers. The third block uses `border-purple-500` with gradient text (`bg-gradient-to-r from-purple-400 to-orange-400`) for emphasis.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- Replace: section label text -->` | Category label (e.g., "The Problem", "Market") |
| `<!-- Replace: hero heading text -->` | Main statement or question |
| `<!-- Replace: stat 1 number, title, and description -->` | First metric |
| `<!-- Replace: stat 2 number, title, and description -->` | Second metric |
| `<!-- Replace: stat 3 number, title, and description -->` | Third metric (gradient-accented) |

**Composition.** Place immediately after Cover to establish context. Works well before Bento Grid or Split Screen to set up the "why" before the "what."

---

### 3. Bento Grid (`bento-grid.html`)

**When to use.** Features, modules, services, product lineup, or plan tiers. Best when presenting 4 items with a clear hierarchy (one primary, one secondary, two supporting).

**Structure.** Header section (label + title + subtitle) followed by a `grid grid-cols-4 grid-rows-2 gap-6` containing 4 cards:

| Card | Grid span | Content |
|------|-----------|---------|
| Hero | `col-span-2 row-span-2` | Icon, title (`text-4xl`), long description, tag + price at bottom |
| Medium | `col-span-2 row-span-1` | Inline icon + title (`text-2xl`), description, tag + price |
| Small 1 | `col-span-1 row-span-1` | Icon, title (`text-xl`), short description, price |
| Small 2 | `col-span-1 row-span-1` | Icon, title (`text-xl`), short description, price |

All cards use `bg-zinc-900/50 border border-zinc-800 rounded-3xl` with internal padding. Each card has a colored icon placeholder (`rounded-2xl` container with a gradient square inside). Colors: purple for hero, orange for medium, emerald for small 1, sky for small 2.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: Section Label -->` | Category label |
| `<!-- REPLACE: Section Title -->` | Grid heading |
| `<!-- REPLACE: Section Subtitle -->` | Supporting description |
| `<!-- REPLACE: Hero card content -->` | Primary feature: title, description, tag, price |
| `<!-- REPLACE: Medium card content -->` | Secondary feature |
| `<!-- REPLACE: Small card 1 content -->` | Supporting feature 1 |
| `<!-- REPLACE: Small card 2 content -->` | Supporting feature 2 |

**Composition.** Place after Impact Stats to transition from problem to solution. Also strong as the centerpiece of a product demo deck.

---

### 4. Split Screen (`split-screen.html`)

**When to use.** Cost vs return, before vs after, problem vs solution, or any two-sided comparison where one side is methodical and the other is impactful.

**Structure.** Two halves side by side using `flex` on the slide container:

- **Left half** (`w-1/2`, `border-r border-zinc-800`): Section label, title (`text-5xl`), a list of line items (each a `flex justify-between` row with `border-b border-zinc-800/50`), and a total row.
- **Right half** (`w-1/2`, `bg-zinc-900/30`): Section label, title, a hero number in `text-[120px]` with gradient text, a label, and a secondary stat (`text-7xl`). Includes purple and orange decorative glow orbs.

The left side feels cold and structured. The right side feels warm and dramatic. This contrast is intentional.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- Replace: section label -->` (x2) | Labels for each half (e.g., "Investment", "Return") |
| `<!-- Replace: left side title -->` | Left heading |
| `<!-- Replace: line item 1-4 -->` | Individual cost/detail rows |
| `<!-- Replace: total line -->` | Summary row |
| `<!-- Replace: right side title -->` | Right heading |
| `<!-- Replace: hero number -->` | Large gradient-text figure (e.g., "340%") |
| `<!-- Replace: hero label -->` | Description under hero number |
| `<!-- Replace: secondary stat -->` | Supporting number and label |

**Composition.** Place after Bento Grid or Impact Stats to show financial justification. Strong as the penultimate slide before CTA.

---

### 5. Timeline (`timeline.html`)

**When to use.** Roadmaps, project phases, implementation steps, or any sequential process with 4 stages.

**Structure.** Section label (orange) and hero heading at top, followed by a horizontal timeline:

- A connecting line: `border-t-2 border-zinc-800` positioned absolutely across the phase markers
- A `grid grid-cols-4 gap-8` with 4 phase columns

Each phase column contains:
- **Phase marker**: `w-14 h-14 rounded-full` circle with a number inside. Phase 1 uses gradient fill (`bg-gradient-to-r from-purple-400 to-orange-400` with white text). Phases 2-4 use `bg-zinc-800` with `text-zinc-400`.
- **Phase title**: `text-2xl font-medium text-white`
- **Duration**: `text-lg text-zinc-500 font-mono`
- **Description**: `text-lg text-zinc-400 font-light`

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: section label text -->` | Category (e.g., "Roadmap", "Process") |
| `<!-- REPLACE: hero heading text -->` | Timeline title |
| `<!-- REPLACE: phase 1-4 -->` | Number, title, duration, and description for each phase |

To highlight a different phase as "current," move the gradient classes (`bg-gradient-to-r from-purple-400 to-orange-400`) to that phase's marker and revert the others to `bg-zinc-800`.

**Composition.** Place after solution slides (Bento Grid or Split Screen) to show how execution unfolds. Pairs naturally with CTA as the next slide.

---

### 6. Comparison (`comparison.html`)

**When to use.** Us vs competitors, plan tiers, feature matrices, or any head-to-head evaluation between two options.

**Structure.** Section label (orange) and hero heading at top, followed by a `grid grid-cols-2 gap-8` with two card columns:

- **Column A** (competitor/alternative): `bg-zinc-900/50 border border-zinc-800 rounded-3xl`. Header in `text-3xl text-zinc-400`. Feature rows use `--` (dash) for missing features and `&#10003;` (checkmark) in `text-green-500/60` for present ones. All text in `text-zinc-400`.
- **Column B** (our solution, highlighted): `border border-purple-500/30` with a subtle purple glow. Header uses gradient text (`from-purple-400 to-orange-400`). All features show green checkmarks (`text-green-400`) with text in `text-zinc-200` (brighter than Column A).

Each feature row is a `flex items-start gap-4` with an indicator and a description.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: section label text -->` | Category label |
| `<!-- REPLACE: hero heading text -->` | Comparison title |
| `<!-- REPLACE: column A header and all feature rows -->` | Competitor name + 6 feature rows |
| `<!-- REPLACE: column B header and all feature rows -->` | Our solution name + 6 feature rows |

**Composition.** Place early-to-mid deck after establishing the problem (Impact Stats). Especially effective in sales proposals before showing pricing (Split Screen).

---

### 7. Quote (`quote.html`)

**When to use.** Testimonials, founder vision statements, customer feedback, or any moment where a human voice adds credibility.

**Structure.** Centered layout (`flex items-center justify-center`). Minimal elements:

- **Decorative quotation mark**: `text-[280px]` serif character in `text-zinc-800/20`, positioned absolute at top-left
- **Quote text**: `text-5xl font-light text-zinc-200 leading-relaxed`, centered, max-width `max-w-5xl`
- **Attribution**: A `flex items-center gap-6` row with a gradient avatar circle (`w-16 h-16 rounded-full bg-gradient-to-r from-purple-400 to-orange-400`), author name (`text-2xl font-medium text-white`), and role/company (`text-xl text-zinc-500`)

A subtle purple glow sits behind the quote area.

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: quote text -->` | The quotation itself |
| `<!-- REPLACE: avatar -->` | Keep gradient circle or replace with an `<img>` |
| `<!-- REPLACE: author name -->` | Speaker's name |
| `<!-- REPLACE: author role and company -->` | Title and organization |

**Composition.** Place after solution or comparison slides to add social proof. Works well as the slide before CTA. Keep to one quote slide per deck to preserve impact.

---

### 8. CTA / Closing (`cta.html`)

**When to use.** Last slide of any presentation. Contact info, next steps, or a closing call to action.

**Structure.** Fully centered layout (`flex flex-col items-center justify-center text-center`) with decorative purple and orange glow orbs. Stacked elements:

- **Section label**: Orange mono text (e.g., "Next Step")
- **CTA heading**: `text-8xl font-semibold` main call to action
- **Subtitle**: `text-2xl text-zinc-400 font-light`, max-width `max-w-3xl`
- **Gradient accent bar**: 200px wide, 3px tall, purple-to-orange
- **Contact grid**: `grid grid-cols-3 gap-16` with email, phone, and website. Each has a mono label (`text-lg text-zinc-500`) and a value (`text-2xl text-white font-light`)
- **Company name**: `font-mono uppercase tracking-label text-zinc-600 text-sm` at the bottom

**Customization points.**

| Marker | What to replace |
|--------|----------------|
| `<!-- REPLACE: section label text -->` | Label (e.g., "Next Step", "Get Started") |
| `<!-- REPLACE: CTA heading text -->` | Main call to action |
| `<!-- REPLACE: CTA subtitle text -->` | Supporting message |
| `<!-- REPLACE: email address -->` | Contact email |
| `<!-- REPLACE: phone number -->` | Phone number |
| `<!-- REPLACE: website URL -->` | Website |
| `<!-- REPLACE: company name or logo -->` | Brand name or logo element |

**Composition.** Always the final slide. Never place mid-deck.

---

## Composition Patterns

Use these sequences as starting points. Add or remove slides based on content depth, but maintain the structural arc: open, establish context, present solution, prove value, close.

### Pitch Deck (5 slides)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Cover | Brand + title |
| 2 | Impact Stats | Problem or opportunity |
| 3 | Bento Grid | Product/solution overview |
| 4 | Split Screen | Investment vs return |
| 5 | CTA | Contact and next steps |

### Sales Proposal (6 slides)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Cover | Brand + proposal title |
| 2 | Impact Stats | Client's pain points in numbers |
| 3 | Comparison | Us vs alternatives |
| 4 | Bento Grid | Solution modules/services |
| 5 | Split Screen | Pricing vs ROI |
| 6 | CTA | Contact and next steps |

### Product Demo (5 slides)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Cover | Product name + tagline |
| 2 | Bento Grid | Feature overview |
| 3 | Timeline | Onboarding or implementation steps |
| 4 | Quote | Customer testimonial |
| 5 | CTA | Trial or contact info |

### Investor Report (5 slides)

| Position | Layout | Purpose |
|----------|--------|---------|
| 1 | Cover | Company + report period |
| 2 | Impact Stats | Key metrics and KPIs |
| 3 | Split Screen | Revenue vs costs, or growth analysis |
| 4 | Timeline | Roadmap or milestones ahead |
| 5 | CTA | Investor relations contact |

---

## Adaptation Rules

### Adjusting stat counts in Impact Stats

The default grid uses `grid-cols-3` with 3 stat blocks.

- **2 stats**: Change to `grid-cols-2`. Remove one stat block. Apply the gradient accent to the second stat.
- **4 stats**: Change to `grid-cols-4 gap-8` (tighter gap). Reduce number size to `text-7xl` and description to `text-lg` to prevent overflow. Apply gradient accent to the last stat.
- **1 stat**: Remove the grid entirely. Center a single stat block with the gradient number at `text-[120px]` (use the Mega Number token from the design system).

### Adjusting Bento Grid card counts

The default grid uses 4 cards in a `grid-cols-4 grid-rows-2` layout.

- **3 cards**: Remove one small card. Change the medium card to `col-span-2 row-span-1` (no change needed). The remaining small card expands to `col-span-2 row-span-1` to fill the row.
- **5 cards**: Add a third small card. Change the grid to `grid-cols-6 grid-rows-2`. Hero stays at `col-span-3 row-span-2`. Medium becomes `col-span-3 row-span-1`. Three small cards each become `col-span-2 row-span-1`.
- **6 cards**: Use `grid-cols-3 grid-rows-2` with all cards at `col-span-1 row-span-1`. Make the top-left card `col-span-2 row-span-1` for hierarchy. All cards use the small card styling.

### Using Split Screen with non-financial content

The left/right structure works for any dichotomy. Replace line items and totals with the appropriate content type:

- **Before/After**: Left side lists current-state pain points. Right side shows the transformed state with a hero metric.
- **Problem/Solution**: Left side lists specific problems. Right side shows the solution with an impact number.
- **Features/Benefits**: Left side lists technical features. Right side highlights the key benefit with a large number or percentage.

Keep the visual temperature contrast: left side stays clinical (plain `text-zinc-400`, no gradients), right side stays warm (gradient text, glow effects).

### Combining patterns on a single slide

Avoid this. Each template is designed to fill 1920x1080 with appropriate whitespace. Cramming two patterns onto one slide creates visual noise and undermines the design system's spacing rules.

If content demands density, prefer:

- Use Impact Stats with 4 columns instead of merging stats into a Bento Grid.
- Use Bento Grid with more cards instead of embedding stats inside cards.
- Add an extra slide rather than overloading one.

### Changing the highlighted phase in Timeline

Move the gradient marker classes to whichever phase is "current" or most important:

```html
<!-- Active phase marker -->
<div class="... bg-gradient-to-r from-purple-400 to-orange-400">
  <span class="text-xl font-bold text-white">02</span>
</div>

<!-- Inactive phase marker -->
<div class="... bg-zinc-800">
  <span class="text-xl font-bold text-zinc-400">01</span>
</div>
```

### Adjusting Comparison to more than 2 columns

The default uses `grid-cols-2`. For a 3-column comparison (e.g., Basic / Pro / Enterprise):

- Change to `grid-cols-3 gap-6`.
- Apply the accent border (`border-purple-500/30`) and gradient header to the recommended option.
- Keep the other columns with `border-zinc-800` and `text-zinc-400` headers.
- Reduce feature text to `text-lg` to fit.

### Swapping the Quote avatar for an image

Replace the gradient circle `div` with an `img` tag. Keep the same dimensions and rounding:

```html
<img src="avatar.jpg" class="w-16 h-16 rounded-full object-cover flex-shrink-0" />
```

### Adjusting CTA contact grid

- **2 contacts**: Change to `grid-cols-2`. Remove the unused column.
- **4 contacts**: Change to `grid-cols-4 gap-12`. Reduce label text to `text-base` and value text to `text-xl`.
- **1 contact**: Remove the grid. Center a single contact block.

---

## Quick Selection Guide

Use this table to pick the right layout based on what you need to communicate:

| You need to... | Use this layout |
|----------------|----------------|
| Open the presentation | Cover |
| Show big numbers that shock or impress | Impact Stats |
| Display features, modules, or services | Bento Grid |
| Compare two sides (cost/value, old/new) | Split Screen |
| Show a sequence of steps or phases | Timeline |
| Compare us vs them, or plan vs plan | Comparison |
| Add a human voice or testimonial | Quote |
| Close with contact info or next steps | CTA |
