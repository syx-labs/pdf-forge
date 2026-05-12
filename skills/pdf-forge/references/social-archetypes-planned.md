# Planned social archetypes

These archetypes are designed in the roadmap but not yet shipped under `assets/templates/social/`. Use them as a vocabulary when composing custom HTML — pick the archetype that matches the content goal, then compose from `_shared/boilerplate.html` honoring type scales and safe zones.

| Archetype | Purpose |
|-----------|---------|
| `mega-stat` | One huge number centered — ROI, percentage, hero metric |
| `steps` | Numbered list — framework, how-to, playbook |
| `quote` | Centered pull quote with attribution |
| `before-after` | Split view — problem vs solution, cost vs return |
| `definition` | Term + explanation — glossary, concept card |
| `checklist` | Bullet/check marks list — tips, to-dos |
| `cta` | Final slide — follow/save/link |
| `photo-overlay` | Image background + text overlay (requires `allow_photos: true`) |
| `bento` | Asymmetric grid of cards — features, services |

When a follow-up plan ships any of these as proper templates under `assets/templates/social/<archetype>/`, move the corresponding row from this file into the main archetype table in `SKILL.md`.
