# ADR 0001: Typed Registry and Governed Data Boundaries

- **Status:** Accepted
- **Date:** 2026-08-17

## Context

PDF Forge currently keeps document authoring separate from rendering: an AI-facing skill produces self-contained HTML, and the TypeScript pipeline renders that HTML through Playwright before merging output with pdf-lib. This boundary supports `slides`, `docs`, and `social` documents without requiring a framework-specific component runtime.

The next milestone introduces two capabilities without weakening that model:

1. a versioned, typed registry for reusable primitives and document blocks; and
2. governed data snapshots that can populate those blocks through a DeepSQL-compatible provider boundary.

The architecture must prevent registry composition from becoming a second renderer, prevent data acquisition concerns from leaking into templates, and preserve the existing raw-HTML workflow. It must also make document inputs and data provenance inspectable and deterministic enough to produce auditable build receipts.

## Decision

PDF Forge will add a typed composition layer before the existing renderer. A versioned document manifest is parsed at the trust boundary, registry entries are resolved by identifier and version, and each entry validates its own props before producing self-contained HTML pages. The existing social manifest remains a separate contract and will not be overloaded for composition.

Playwright remains the default renderer. Registry composition produces the same kind of self-contained HTML that the current pipeline already accepts; it does not introduce a React, Next.js, Takumi, or Forme rendering path. Existing format detection, overflow checks, Playwright rendering, and pdf-lib merging remain authoritative.

The data path is separate and precedes composition. A `DataProvider` owns acquisition and returns a parsed, immutable, versioned `DataSnapshot`. Composition receives only that snapshot and binds validated values into registry block props. Provider lifecycle and capability seams are local PDF Forge contracts rather than a dependency on an external agent runtime.

Compatibility is additive: direct HTML remains supported. Callers may continue to submit self-contained HTML without using the registry or a data provider.

## Alternatives Considered

### Replace Playwright with a registry-specific renderer

Rejected. It would duplicate rendering behavior, create format drift, and weaken the established HTML boundary. The registry is a composition mechanism, not a rendering engine.

### Adopt the full pdfcn application stack

Rejected. PDF Forge adopts the useful registry, primitives-versus-blocks, discoverability, and copy-to-own ideas without a React or Next.js rewrite. Takumi/Forme is deferred until a separate decision demonstrates a concrete need and compatibility with the existing HTML contract.

### Allow composition to query databases directly

Rejected for this milestone. Direct SQL is deferred. Query execution, authentication, connection management, and governance belong to a provider outside composition; PDF Forge accepts only already-governed results represented as a validated snapshot.

### Embed the DeepSQL backend

Rejected. A narrow adapter can consume governed DeepSQL results without importing its user management, RAG, Java services, dashboard, or index-management runtime.

### Add image analysis to the initial registry

Deferred. UniFace is deferred as an optional future `ImageAnalyzerProvider`; it is not a core dependency, and biometric identification is outside this architecture.

## Consequences

### Positive

- Registry items become discoverable, versioned, reusable, and independently validated.
- Composition stays deterministic and testable because it transforms validated manifests and snapshots into HTML.
- Existing templates and direct-HTML callers remain valid.
- Data-backed outputs can include provenance, registry version, component identifiers, and a hash of canonical snapshot bytes in a build receipt.
- Data providers can evolve independently from registry blocks and the renderer.

### Negative

- The system gains new schemas, versioning rules, canonicalization, and error surfaces before rendering.
- Registry authors must maintain both templates and strict prop schemas.
- Snapshot limits, freshness, redaction, and provenance failures must be surfaced explicitly rather than silently producing a partial document.
- Deterministic composition does not make final rendering byte-identical across uncontrolled browser or font environments; those environments still require pinning and verification.

## Security Boundaries

- The provider owns transport, authentication, connection profiles, and acquisition. composition never receives database credentials.
- Provider requests must be constrained to approved, read-only operations, and snapshots must record `read-only` provenance.
- Manifests, registry metadata, block props, provider responses, and snapshots are untrusted at their respective boundaries and must be parsed with closed schemas before domain use.
- Database credentials, connection secrets, and arbitrary SQL text must not appear in document manifests, registry templates, generated HTML, build receipts, or block props.
- Generated HTML has no database or provider capability and must not use network access to fetch governed data at render time.
- Providers apply row, column, payload-size, freshness, timeout, and redaction policies before returning a snapshot. Invalid or over-limit data fails closed.
- Snapshot hashing uses canonical validated data. Volatile receipt metadata such as generation time is excluded from the snapshot digest.
- A production DeepSQL connection profile requires human review before activation; PDF Forge does not create indexes, modify data, or administer users.

## Rollout

1. Add and test the versioned registry schemas, loader, resolver, and deterministic composition contracts without changing direct-HTML behavior.
2. Ship a small tracer registry containing `metric-card`, `data-table`, and `executive-report`, with canonical examples and previews.
3. Add the `DataProvider` seam and a local `StaticJsonProvider`; validate canonical snapshot hashing, limits, redaction, provenance, and receipt generation with fixtures.
4. Connect snapshot values to typed block props and prove the complete manifest-to-HTML-to-PDF path through the existing Playwright pipeline.
5. Expose registry discovery and composition through additive CLI and MCP surfaces while retaining existing raw-HTML inputs.
6. Add a DeepSQL adapter only after its transport, authentication, governed-query, failure, and human-reviewed connection-profile contracts are fixed and tested.

Each phase must keep existing tests green and add failing-then-passing contract, unit, and integration evidence before the next phase begins.

## Rollback

The registry and governed-data paths are additive and must remain separable from the existing renderer. If a rollout phase fails, disable or remove the new CLI/MCP composition entry points and provider registration while leaving the renderer, merger, templates, and raw-HTML interfaces unchanged. Because direct HTML remains supported, callers can return to self-contained HTML generation without a data migration.

Registry manifests and snapshots are versioned inputs rather than mutable renderer state, so rollback selects the last known-good registry version or omits registry composition entirely. DeepSQL credentials remain owned by the external provider boundary and can be revoked independently. Receipts from failed or rolled-back builds remain audit evidence but must not be presented as successful artifacts.
