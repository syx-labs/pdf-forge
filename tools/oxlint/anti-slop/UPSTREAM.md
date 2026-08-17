# Vendored anti-slop rules

- Upstream: <https://github.com/dmmulroy/anti-slop>
- Pinned commit: `446268e5d15baa968eaec669ff65358d36ae6259`
- Reviewed: 2026-08-17
- License: MIT; the upstream license is retained in `LICENSE`.
- Compatible toolchain pinned here: `oxlint@1.78.0` and `@oxlint/plugins@1.78.0`, matching upstream at the pinned commit.

The following upstream files are copied verbatim from the pinned commit:

- `src/rules/no-chained-type-assertions.ts`
- `src/rules/no-known-value-widening.ts`
- `src/rules/no-widen-then-assert.ts`
- `src/rules/no-object-parameters.ts`
- `src/rules/require-safety-comment-for-type-assertion.ts`
- `src/shared/dictionary-types.ts`
- `src/shared/lexical-type-parameters.ts`
- `LICENSE`

`index.ts` is a local, minimal registry that exposes only PDF Forge's reviewed initial subset. Remote repository content was treated as source data; no upstream scripts or instructions were executed.
