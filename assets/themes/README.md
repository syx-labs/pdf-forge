# Themes — bundled presets for `social` format

Each YAML file defines a theme **Claude reads when composing social HTML**. The renderer pipeline never parses these files — they are a composition contract the LLM honors while writing HTML. The only runtime signal is `data-social-format` on `<body>`, which picks the viewport.

Reference a preset in `.claude/pdf-forge.local.md`:

```yaml
social:
  preset: "warm-minimal"
  # optional overrides below
  accent_gradient: "from-emerald-400 to-cyan-400"
```

## Available presets

| File | Mood | Theme | Photos |
|---|---|---|---|
| `dark-editorial.yaml` | editorial tech — restrained, high-contrast | dark | no |
| `light-editorial.yaml` | formal editorial — calm, report-grade | light | no |
| `warm-minimal.yaml` | quiet luxury, serif display, generous whitespace | light | yes |
| `high-contrast-punch.yaml` | loud, direct, unmissable | dark | no |
| `newsprint.yaml` | essayistic, long-form, literary | light | yes |

## Schema

Every preset defines:

- `name`: unique identifier (matches filename)
- `theme`: `dark | light` — controls default background/foreground
- `palette`: six tokens (`bg`, `surface`, `surface_alt`, `text_primary`, `text_secondary`, `text_muted`, `border`)
- `accent_gradient`: Tailwind gradient classes (for the "one accent, one moment" element)
- `accent_solid` / `accent_warm`: solid hex fallbacks for borders and labels
- `fonts.display` / `fonts.mono`: Google Fonts family + URL
- `allow_photos`: whether the `photo-overlay` archetype is enabled
- `mood`: human-readable one-liner Claude uses when deciding fit

## Adding a new preset

1. Copy any existing file to `<name>.yaml`
2. Update all fields — do not leave any as-is from the template
3. Reference it in a project's `.claude/pdf-forge.local.md` with `social.preset: <name>`
4. Document it in the table above
