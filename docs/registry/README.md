# Canonical Registry Gallery

The registry gallery is generated documentation for the components and blocks that PDF Forge actually ships. Its source of truth is `assets/registry/registry.yaml` together with each registry entry's colocated `example.json`, template, and schema or block definition. Do not edit generated previews or gallery metadata by hand.

## Generate

Run from the package root:

```bash
bun run scripts/generate-gallery.ts --output .artifacts/registry-gallery
```

The output path may be relative to the caller's current working directory. It must not already exist; generation fails closed rather than replacing or merging with an older gallery.

## Generated layout

```text
.artifacts/registry-gallery/
├── index.html
├── previews/
│   └── <id>.pdf
└── schemas/
    └── <id>.<ext>
```

- `index.html` is a standalone, browsable catalog with registry metadata and relative links.
- `previews/<id>.pdf` contains one real PDF preview for every sorted registry entry.
- `schemas/<id>.<ext>` is a byte-for-byte copy of the canonical JSON schema or YAML block definition, preserving its original extension.

The PDFs are evidence produced from canonical fixtures through the canonical composer and the real Playwright renderer. They are not hand-created screenshots or substitute documents. All entry pages are composed first and rendered in one batch.

The generated `.artifacts/registry-gallery/` directory is verification output and must not be committed. Regenerate it whenever evidence is needed, inspect it, and remove it before preparing repository changes.

## Adding or changing an entry

Adding a registry entry requires a colocated `example.json` beside its template and schema or definition. The example must parse as JSON and must validate through the real document manifest and composer for the entry's first declared theme in `docs` format.

A missing or malformed example, an invalid registry definition, a composition error, or a Playwright render failure is not skipped: the generation failure blocks publishing the gallery, and no final output directory is left behind. Update the canonical source, rerun the generator, and require the full gallery to succeed.
