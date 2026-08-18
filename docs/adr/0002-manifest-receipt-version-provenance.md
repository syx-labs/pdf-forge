# ADR 0002: Bind Registry Versions in the Build Receipt

- Status: Accepted
- Date: 2026-08-18

## Context

A document manifest selects registry entries by stable `kind` and `id`. Adding a version field to every selection would make the manifest duplicate registry metadata and would couple callers to per-entry release details. At the same time, replaying a manifest against a different registry release must never be presented as the same governed build.

The governed artifact is therefore not the manifest alone. Its reproducibility envelope is **manifest + snapshot + build receipt**.

## Decision

Keep version selection out of the version 1 manifest contract. The trusted build path must instead:

1. Resolve all selected components from one loaded registry.
2. Record the loaded `registryVersion` and every resolved `componentVersions` value in the build receipt.
3. Bind `manifest.snapshotRef` to the exact `snapshotId` whose canonical bytes are hashed.
4. Verify the produced PDF before persisting the receipt.
5. Treat replay as equivalent only when the manifest, canonical snapshot hash, `registryVersion`, `componentVersions`, and verified output evidence match.

If a caller requests deterministic replay but the recorded registry release or component versions are unavailable or differ, composition **must fail closed**. It must not silently resolve the same IDs from a newer registry and claim equivalence.

## Consequences

- Manifests stay concise and remain compatible with the version 1 API.
- The receipt is mandatory audit evidence for a governed build, rather than optional metadata.
- The same manifest may intentionally produce a different build under a newer registry, but that build receives different version provenance and cannot masquerade as the old build.
- Introducing caller-selected component versions later requires a new manifest version and a separate migration ADR; it is not an implicit extension of version 1.
