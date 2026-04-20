# Cover archetype — NOTES

Opening slide for a post or carousel. Primary job: create enough curiosity to earn the next glance.

## When to use

- First slide of a carousel (always)
- Standalone post when the headline itself is the payload (quote-like posts)
- Story cover when the content is educational/announcement rather than casual

## Variants

| File | Format | Notes |
|---|---|---|
| `post-1-1.html` | Post 1:1 | Bottom-anchored headline, top-right glow |
| `post-4-5.html` | Post 4:5 | Same layout, taller breathing room |
| `carousel-1-1.html` | Carousel 1:1 | Adds slide counter + `Deslize →` hint |
| `carousel-4-5.html` | Carousel 4:5 | Same carousel cues, portrait spacing |
| `story.html` | Story 9:16 | Headline mid-slide, respects top/bottom safe zones |

## REPLACE slots

- Section label (`font-mono uppercase tracking-label` + `text-lg`/`text-xl`/`text-2xl` per format — see `_shared/type-scales.md`): category, guide number, series tag
- Headline: 6-14 words max; wrap the key noun in the gradient span
- Sub-caption / @handle: optional one-liner below
- (Carousel only) Slide counter: `NN/TT` updated automatically or hand-set

## Design rules locked in

- One gradient word max per headline (the "one accent, one moment" rule)
- Orange-600/10 glow positioned top-right — structural depth, not decoration
- Zinc-500 label / white headline / zinc-500 body creates a clear three-step hierarchy
- Never add a second accent color to the cover — let the gradient be the entire visual punctuation

## Anti-patterns to avoid

- Centering both label and headline: kills rhythm, reads as template
- Full-white headline with gradient on a non-key word: the eye lands wrong
- More than one line of sub-caption: competes with the hook
- Replacing the gradient with a solid color: flattens the piece
