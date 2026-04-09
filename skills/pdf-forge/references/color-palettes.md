# Color Palettes Reference

This document defines the color system for pdf-forge. Follow these rules exactly when generating PDF templates.

---

## Dark Theme (Default)

The primary theme. Inspired by Vercel/Stripe aesthetic: zinc backbone with contained accent. Use this theme for dashboards, reports with visual impact, and modern presentations.

### Background Layers

Use three depth levels to create visual hierarchy without borders:

```
zinc-950     -> page background (deepest layer)
zinc-900/50  -> cards, grouped content (translucent for depth)
zinc-900/30  -> secondary panels, split screens, sidebars
```

Always use translucent variants (`/50`, `/30`) for nested containers. This creates depth without heaviness. Never stack opaque backgrounds.

### Text Hierarchy

Control emphasis through shade, not color. The zinc scale provides five distinct levels:

```
white        -> maximum emphasis (highlighted titles, key monetary values)
zinc-100     -> standard headings (h1, h2, section titles)
zinc-300     -> large numbers, statistics, data points
zinc-400     -> body text, descriptions, paragraph content
zinc-500     -> captions, metadata, labels, timestamps, secondary info
```

Never skip more than one level in a single visual group. A card heading in `zinc-100` pairs with body in `zinc-400`, not `zinc-500`.

### Accent System

Three accent tools, each with a specific role:

```
orange-500                              -> section labels (warm, authoritative)
purple-500                              -> border accents (cold, structural)
gradient from-purple-400 to-orange-400  -> "victory moments" ONLY
```

**Section labels**: Use `text-orange-500` for category tags, section identifiers, and navigational markers. Apply as small uppercase text above headings.

**Border accents**: Use `border-purple-500` or `border-l-purple-500` for left-edge highlights on featured cards or active states. Keep to 2px or 4px width.

**Victory gradient**: Apply `bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent` exclusively to the single most important number on a page — total ROI, revenue figure, hero metric. Limit to 1-2 elements per entire document.

### Borders

```
zinc-800     -> card borders, major dividers (visible structure)
zinc-800/50  -> subtle internal separators (within cards, between rows)
```

Keep all borders at 1px. Never use 2px+ borders except for accent highlights.

### Effects

```
bg-orange-600/10 blur-[100px]  -> decorative glow (absolute positioned, behind content)
```

Use the glow as a background decoration only. Place it with `absolute` positioning behind hero sections. It must never carry information or indicate state. One glow per page maximum.

### The Golden Rule

One accent color, one moment. The purple-to-orange gradient is reserved exclusively for the highest-impact number on the page. Everything else uses the zinc scale. This restraint is what separates sophisticated design from AI-generated visual noise. PDFs that throw color everywhere lose all contrast and hierarchy.

---

## Light Theme (Formal Documents)

Use for reports, proposals, contracts, invoices, and any context where dark mode is inappropriate. The light theme inverts the zinc scale while preserving the same structural logic.

### Background Layers

```
white        -> page background
zinc-50      -> cards, grouped content
zinc-100     -> secondary panels, sidebars
```

Never use colored backgrounds in light mode. All containers use zinc-neutral fills only.

### Text Hierarchy

```
zinc-950     -> headings (maximum weight)
zinc-800     -> body text, primary content
zinc-600     -> secondary text, supporting details
zinc-500     -> captions, metadata, labels
```

### Borders

```
zinc-200     -> card borders, major dividers
zinc-200/50  -> subtle internal separators
```

### Accent

Inherit accent colors from brand configuration. Defaults: same purple/orange pair, applied more sparingly than in dark theme. In light mode, use accents only for:

- Left border highlights on key cards (`border-l-purple-500`)
- Section label text (`text-orange-500`)
- Victory gradient on hero metrics

Never apply accent-colored backgrounds in light mode. No colored cards, no tinted sections. The restraint is even stricter here.

---

## Brand Customization

Users configure brand colors in `.claude/pdf-forge.local.md`:

```yaml
---
brand:
  name: "Company Name"
  primary: "purple-500"
  secondary: "orange-500"
  theme: "dark"
---
```

`primary` and `secondary` accept Tailwind class name fragments (e.g., `blue-600`, `emerald-500`). `theme` accepts `dark` or `light`.

### How to Apply Brand Colors

Follow this substitution map when brand colors are configured:

1. **Victory gradient**: Replace `from-purple-400 to-orange-400` with `from-{primary-400} to-{secondary-400}`. Adjust the shade number to match (use `-400` for gradient endpoints).
2. **Section labels**: Replace `text-orange-500` with `text-{secondary-500}`.
3. **Border accents**: Replace `border-purple-500` with `border-{primary-500}`.
4. **Glow effect**: Replace `bg-orange-600/10` with `bg-{secondary-600}/10`.
5. **Zinc backbone stays fixed**: Never replace zinc colors with brand colors. The zinc scale provides the neutral structure that makes accents work. Replacing zinc with brand colors destroys hierarchy.

### Mapping Brand Hex to Tailwind

When brand provides hex values instead of Tailwind class names, inject custom colors via the Tailwind CDN configuration block:

```html
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          brand: {
            primary: '#8b5cf6',
            secondary: '#f97316'
          }
        }
      }
    }
  }
</script>
```

Then reference as `text-brand-primary`, `bg-brand-secondary`, `from-brand-primary`, `to-brand-secondary`, `border-brand-primary`, etc.

Generate shade variants when needed by adjusting the hex values manually:
- `-400` shade: lighter variant (for gradient endpoints)
- `-500` shade: standard variant (for text and borders)
- `-600` shade: darker variant (for glow effects with `/10` opacity)

---

## Color Application Rules

### Do

- Use zinc shades for 90% of the design. Color is the exception, not the rule.
- Reserve the victory gradient for 1-2 elements per page maximum.
- Create hierarchy through shade variation, not color variation. Five levels of zinc provide all the contrast needed.
- Use translucent backgrounds (`zinc-900/50`, `zinc-900/30`) for layered depth without visual weight.
- Keep borders subtle: 1px width, low opacity or muted shades.
- Pair section label color (`orange-500`) with border accent color (`purple-500`) to create warm/cool tension.
- Test text contrast mentally: `zinc-400` on `zinc-950` is readable; `zinc-500` on `zinc-900` is not. Always ensure at least 3 shade steps between text and its background.

### Do Not

- Color backgrounds of entire sections. This creates visual chaos and eliminates hierarchy.
- Use accent colors for body text. Accents are markers, not content.
- Apply gradients to backgrounds, borders, or large surface areas. Gradients are for text on hero metrics only.
- Mix warm and cool accents freely. Stick to the defined pair (primary + secondary). Do not introduce third accent colors.
- Use pure black (`black`) anywhere. Use `zinc-950` instead. Pure black creates harsh contrast that breaks the design system.
- Use `white` for backgrounds in dark theme. Use `zinc-950` for backgrounds, reserve `white` for maximum-emphasis text.
- Add color to convey information that is not also conveyed by text, position, or iconography. Color is decorative emphasis, not semantic encoding.
- Override the zinc backbone with brand colors. The neutral structure is not negotiable.
