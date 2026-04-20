# Social — Type Scales per Aspect Ratio

Calibrated from pdf-forge's existing slide/doc scales, scaled for Instagram viewports. Use these exact values in archetype templates — do not improvise sizes.

## Viewport context

| Format | Width × Height | Carousel |
|---|---|---|
| `post-1-1` | 1080 × 1080 | No |
| `post-4-5` | 1080 × 1350 | No |
| `carousel-1-1` | 1080 × 1080 | Yes |
| `carousel-4-5` | 1080 × 1350 | Yes |
| `story` | 1080 × 1920 | No |

`carousel-*` shares the viewport of its matching `post-*` — the scale table applies equally.

## Scale per format

### `post-1-1` / `carousel-1-1`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-lg font-mono uppercase tracking-label` | Category tags, markers |
| Hero Heading | `text-5xl font-semibold tracking-heading leading-tight` | Cover titles, main headline |
| Sub Heading | `text-3xl font-semibold tracking-heading` | Sub-titles, second-line |
| Body | `text-xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs, descriptions |
| Caption | `text-base text-zinc-500 font-light tracking-body` | Metadata, attribution |
| Big Number | `text-[120px] font-bold leading-none tracking-display` | Stats, KPIs |
| Mega Number | `text-[180px] font-bold leading-none tracking-display` | Hero metric |

### `post-4-5` / `carousel-4-5`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-xl font-mono uppercase tracking-label` | Category tags, markers |
| Hero Heading | `text-6xl font-semibold tracking-heading leading-tight` | Cover titles |
| Sub Heading | `text-4xl font-semibold tracking-heading` | Sub-titles |
| Body | `text-2xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs |
| Caption | `text-lg text-zinc-500 font-light tracking-body` | Metadata |
| Big Number | `text-[140px] font-bold leading-none tracking-display` | Stats |
| Mega Number | `text-[200px] font-bold leading-none tracking-display` | Hero metric |

### `story`

| Token | Classes | Use |
|---|---|---|
| Section Label | `text-2xl font-mono uppercase tracking-label` | Markers, tags |
| Hero Heading | `text-7xl font-semibold tracking-heading leading-tight` | Main headline |
| Sub Heading | `text-5xl font-semibold tracking-heading` | Secondary line |
| Body | `text-3xl text-zinc-400 font-light tracking-body leading-relaxed` | Paragraphs |
| Caption | `text-xl text-zinc-500 font-light tracking-body` | Meta, dates |
| Big Number | `text-[180px] font-bold leading-none tracking-display` | Stats |
| Mega Number | `text-[240px] font-bold leading-none tracking-display` | Hero metric |

## Rules

- Never use positive `tracking-wide` / `tracking-wider` / `tracking-widest`. Positive letter-spacing is the top marker of AI-sloppy output.
- Always pair hero + sub + body at visible size jumps — if they are within 1 step of each other, the hierarchy reads flat.
- The mega number gradient (`bg-gradient-to-r from-purple-400 to-orange-400 bg-clip-text text-transparent`) appears at most once per slide, never on multiple elements.
