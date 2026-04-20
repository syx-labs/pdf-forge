# Social — Safe Zones per Format

Instagram overlays UI chrome on certain formats. These zones must remain free of critical content (logos, headlines, key text, clickable CTAs).

## Per format

### `post-1-1` / `post-4-5` / `carousel-1-1` / `carousel-4-5`

No critical overlay zones. Feed posts render edge-to-edge inside the grid, cropped only by the user's thumb when scrolling.

Apply interior padding anyway for visual breathing room:

- Minimum padding: `p-[96px]` on all sides
- Preferred: `p-[120px]` for post-4-5 (more vertical space lets content breathe)
- Bottom padding extra for `@handle` footer when `default_footer: true`: add `pb-[144px]`

### `story`

Two zones are covered by Instagram's Story UI — never place critical content there:

| Zone | Y range | Covered by |
|---|---|---|
| Top | 0 - 250px | Profile avatar, username, timestamp, 3-dot menu, close button |
| Bottom | 1640 - 1920px | Reply bar, reaction button, send arrow, progress indicators |

Critical content lives in `y: 250 - 1640` (1390px of safe height).

Apply via Tailwind: wrap content in `<div class="pt-[250px] pb-[280px] h-screen flex flex-col justify-between">` so top/bottom padding is respected automatically.

## Carousel slide-1 swipe indicator

First slide of a carousel should include a visual cue that more follows. Two options:

1. **Page counter**: `01/07` in top-right, `text-sm font-mono text-zinc-500`.
2. **Swipe arrow**: `→` or `Deslize →` in bottom-right of slide-1 only.

Generated automatically by the carousel helper; manual templates can include either.

## Verification

Render the template, then overlay a safe-zone mask in image-editor or via the `--preview` grid. If critical text disappears behind the Story UI mockup, redesign the layout — never let the platform crop meaning.
