# Tailwind CSS for PDF Generation -- Technical Reference

Use this reference when generating HTML templates for Playwright-based PDF rendering. All layouts use the Tailwind CDN (runtime JIT) with no build step.

---

## HTML Template Structure

Use this exact boilerplate for every generated page:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap" rel="stylesheet" />
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'system-ui', 'sans-serif'],
          },
          letterSpacing: {
            'display': '-0.1em',
            'heading': '-0.06em',
            'body': '-0.025em',
            'label': '-0.01em',
          },
          lineHeight: {
            'tight': '1.15',
            'snug': '1.3',
            'relaxed': '1.75',
          },
          // Brand color overrides go here
        },
      },
    };
  </script>
</head>
<body class="m-0 p-0 bg-zinc-950">
  <!-- Single page content here -->
</body>
</html>
```

Key rules:
- Always include `m-0 p-0` on `<body>` to eliminate default browser margins.
- Load Inter as a variable font (`wght@100..900`) via `<link>` with preconnect hints (faster than `@import`).
- The `tailwind.config` defines semantic tracking tokens (`tracking-display`, `tracking-heading`, `tracking-body`, `tracking-label`) and industry-aligned line heights. Always include these.
- Place brand color overrides inside the extend block alongside the existing tokens.
- Do NOT use `@apply` -- it is unavailable via the CDN. Use inline utility classes exclusively.

---

## Page Dimensions

### Slides (16:9 Presentation Format)

| Property | Value |
|---|---|
| Container classes | `w-[1920px] h-[1080px]` |
| Playwright viewport | `{ width: 1920, height: 1080 }` |
| Rendering method | `page.screenshot({ fullPage: true })` to PNG, then embed in PDF |

Use screenshot rendering for slides. The `page.pdf()` print engine attempts to paginate content, which breaks fixed 1920x1080 layouts. Capture each slide as a full-page screenshot, then compose the PNGs into a single PDF.

### Documents (A4)

| Property | Value |
|---|---|
| Container classes | `w-[210mm] min-h-[297mm]` |
| Alternative (96 DPI) | `w-[794px] min-h-[1123px]` |
| Playwright viewport | `{ width: 794, height: 1123 }` |
| Rendering method | `page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } })` |

Use `page.pdf()` for documents. Content flows and paginates naturally through the print engine.

### Documents (Letter)

| Property | Value |
|---|---|
| Container classes | `w-[8.5in] min-h-[11in]` |
| Alternative (96 DPI) | `w-[816px] min-h-[1056px]` |
| Playwright viewport | `{ width: 816, height: 1056 }` |
| Rendering method | Same as A4, with `format: 'Letter'` |

---

## Tailwind CDN -- Behavior and Constraints

### Waiting for Tailwind to Process

The CDN script compiles utility classes at runtime. Playwright must wait for compilation to finish before capturing any output:

```typescript
await page.waitForFunction(() => {
  const styles = document.querySelectorAll('style');
  return Array.from(styles).some(s => s.textContent?.includes('--tw-'));
});
```

This checks that Tailwind has injected its generated `<style>` block containing CSS custom properties.

### Supported Features

The CDN version supports all standard Tailwind utilities:

- **Arbitrary values**: `w-[1920px]`, `text-[120px]`
- **Opacity modifiers**: `zinc-900/50`, `zinc-800/50`
- **Gradients**: `bg-gradient-to-r from-purple-400 to-orange-400`
- **Backdrop and filter**: `blur-[100px]`, `backdrop-blur-xl`
- **Text clipping**: `bg-clip-text` + `text-transparent` for gradient text
- **All flex/grid utilities**: `flex`, `grid`, `gap-*`, `justify-*`, `items-*`, etc.
- **Custom config via `tailwind.config`**: extend theme colors, spacing, fonts

### NOT Supported via CDN

- `@apply` directives -- must use inline utility classes instead
- Custom plugins (no `plugin()` function)
- PostCSS preprocessing
- PurgeCSS -- all utilities ship (~300KB), but file size is irrelevant for PDF generation

---

## CSS Techniques for PDF

### Gradient Text

```html
<p class="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-orange-400">
  R$130K
</p>
```

Combine `text-transparent`, `bg-clip-text`, and a gradient background. The gradient fills only the text glyphs.

### Glow Effects

```html
<div class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2
            w-[600px] h-[600px] bg-orange-600/10 blur-[100px] rounded-full
            pointer-events-none"></div>
```

Rules for glow elements:
- Always use `absolute` positioning relative to a `relative` parent.
- Always add `pointer-events-none` -- the glow is purely decorative.
- Use large `blur-[100px]` values and low-opacity colors (`/10`, `/20`).

### Border-Left Accent Blocks

```html
<div class="border-l-4 border-zinc-800 pl-8">
  <p class="text-8xl font-bold">91%</p>
  <h4 class="text-2xl font-medium">Title</h4>
  <p class="text-xl text-zinc-500 font-light">Description</p>
</div>
```

Use `border-l-4` with generous `pl-8` padding for stat blocks and callouts.

### Translucent Cards

```html
<div class="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-10">
  <!-- card content -->
</div>
```

Design conventions:
- Use `rounded-3xl` (24px radius) for cards and containers.
- Use `rounded-2xl` (16px radius) for icons and badges.
- Apply translucent backgrounds with opacity modifiers (`bg-zinc-900/50`).

### Page Breaks (Multi-Page A4 Documents)

When generating multi-page A4 documents in a single HTML file, separate pages with explicit break directives:

```html
<div class="w-[210mm] min-h-[297mm] p-16">
  <!-- Page 1 content -->
</div>
<div class="w-[210mm] min-h-[297mm] p-16" style="page-break-before: always;">
  <!-- Page 2 content -->
</div>
```

The `page-break-before: always` rule forces the print engine to start a new page. Use inline `style` for this -- Tailwind does not provide a page-break utility.

---

## File Naming Convention

Name HTML files sequentially to control page order:

```
01-cover.html
02-problem.html
03-solution.html
04-modules.html
05-roi.html
06-cta.html
```

The render script processes files in alphabetical order. Zero-padded numbers ensure correct sorting.

---

## Playwright Script Interface

### render-pdf.ts

```
Usage: bun run scripts/render-pdf.ts <input-dir> [--format slides|docs] [--output <dir>] [--scale 2]

Arguments:
  input-dir    Directory containing numbered HTML files
  --format     "slides" (screenshot -> PDF) or "docs" (page.pdf)
  --output     Output directory for rendered files (default: ./output/)
  --scale      Device scale factor 1-4 (default: 2, produces HiDPI output)
```

For slides, the script sets `deviceScaleFactor` to the scale value (default 2x) and screenshots each HTML at 1920x1080 CSS pixels, producing PNGs at 3840x2160 actual pixels. These are then embedded into PDF pages at 1440x810 points (20"x11.25"), yielding ~267 DPI -- sharp on both screen and print. Use `--scale 3` for ~400 DPI print-quality output.

For docs, the script uses `page.pdf()` with A4 format, zero margins, and `printBackground: true`. The scale factor applies to the rendering quality of the PDF as well.

### merge-pages.ts

```
Usage: bun run scripts/merge-pages.ts <input-dir> [--output output.pdf]

Arguments:
  input-dir    Directory with PNGs or individual PDFs
  --output     Output merged PDF path
```

---

## Font Loading

Google Fonts load asynchronously. Wait for fonts to be ready before rendering:

```typescript
await page.waitForFunction(() => document.fonts.ready.then(() => true));
```

Call this after the Tailwind readiness check. Rendering before fonts load results in fallback system fonts appearing in the output.

---

## Common Pitfalls

1. **Missing `printBackground: true`** -- Without this flag, `page.pdf()` renders all backgrounds as transparent. Every `bg-*` class becomes invisible.

2. **Not waiting for Tailwind CDN** -- Capturing before Tailwind compiles produces unstyled HTML with raw utility classes having no effect.

3. **Using `page.pdf()` for fixed-dimension slides** -- The print engine paginates content, breaking 1920x1080 fixed layouts. Use `page.screenshot()` instead.

4. **Missing `m-0 p-0` on body** -- Default browser margins (typically 8px) offset all content from the expected position.

5. **Using `min-h-screen` instead of fixed height** -- `screen` refers to the viewport, not the page. Use explicit dimensions (`h-[1080px]`, `min-h-[297mm]`).

6. **Google Fonts not loading** -- Always await `document.fonts.ready` before rendering. Network latency can cause the font request to still be in flight when Playwright captures.

7. **Using `@apply` in `<style>` blocks** -- The CDN does not support `@apply`. Write all styles as utility classes directly on elements.

8. **Forgetting `overflow-hidden` on slide containers** -- Content that exceeds 1080px height will extend below the visible area and get cropped unpredictably by the screenshot. Add `overflow-hidden` to the root slide container to enforce boundaries.
