# PDF Forge Typed Registry + Governed Data Integration Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Add two complementary integrations to PDF Forge: (1) a pdfcn-inspired typed registry/composer for reusable PDF components and blocks, and (2) a DeepSQL-compatible, read-only data-provider boundary that turns governed data snapshots into auditable documents without giving the renderer or authoring agent database credentials.

**Architecture:** Preserve PDF Forge's current invariant: the AI-facing skill authors or selects document structure, while the TypeScript engine renders self-contained HTML through Playwright and merges outputs with pdf-lib. Add a typed composition layer before rendering (`manifest → Zod parse → registry resolve → HTML pages`) and a separate data acquisition layer before composition (`provider → validated DataSnapshot → block props`). Apply DeepSeek Harness ideas only as local capability seams and explicit provider lifecycles; do not depend on the Harness runtime. Apply a reviewed subset of anti-slop rules to force evidence at JSON/YAML/MCP/provider boundaries. Keep UniFace as a deferred optional image-analysis provider, not part of the initial milestone.

**Tech Stack:** Bun, TypeScript 7 strict mode, Zod 4, js-yaml, Playwright, pdf-lib, MCP SDK, Bun test, Oxlint with vendored anti-slop rules; optional DeepSQL HTTP/MCP adapter behind an interface.

---

## Objective anchor

- **Objective:** Deliver typed, reusable, data-backed PDF generation while preserving current direct-HTML behavior.
- **Done when:** A fixture `DataSnapshot` can be composed through a registry `executive-report` block into HTML, rendered by the existing Playwright pipeline, merged into a valid PDF, and returned by CLI/MCP with a deterministic receipt linking output to the snapshot hash and registry version.
- **State:** Planned; no implementation authorized by this document.
- **Primary blockers:** DeepSQL adapter transport/auth contract must be fixed before production use; registry schema needs an ADR before public API stabilization.
- **Evidence required:** failing-then-passing tests per slice, full `bun run typecheck`, `bun run build`, browser integration suite, CLI/MCP smoke tests, generated PDF loaded by pdf-lib, receipt hash verified against canonical snapshot bytes.
- **Next action after approval:** Execute Task 1 only, then stop for the first spec/code review gate.

## Scope

### Integration A — Typed component registry inspired by pdfcn

Deliver:

- versioned registry manifest;
- reusable primitives and blocks;
- Zod-validated document manifests;
- deterministic HTML composition;
- registry discovery through CLI and MCP;
- initial `metric-card`, `data-table`, and `executive-report` tracer bullet;
- canonical previews and integration tests.

Preserve:

- direct self-contained HTML input;
- Playwright as the only production renderer;
- all existing `slides | docs | social` behavior;
- existing templates as valid authoring assets.

### Integration B — Governed data snapshots compatible with DeepSQL

Deliver:

- `DataProvider` capability seam;
- `StaticJsonProvider` reference implementation;
- immutable, versioned `DataSnapshot` contract;
- snapshot canonicalization and SHA-256 receipt;
- DeepSQL adapter that accepts only already-governed read-only results;
- limits, redaction hooks, provenance, freshness, and failure semantics;
- data binding into registry block props.

Do not deliver:

- direct arbitrary SQL execution from PDF Forge;
- database credentials in PDF Forge manifests;
- index creation/application;
- DeepSQL user management, RAG, Java backend, or dashboard runtime;
- network access from generated HTML;
- production activation without a human-reviewed DeepSQL connection profile.

## Source-informed decisions

| Source | Adopt | Do not adopt |
|---|---|---|
| `shadcn-labs/pdfcn` | Registry, copy-to-own mindset, primitives vs blocks, discoverable previews, typed composition | React/Next rewrite, immediate Takumi/Forme production dependency |
| `DeepSQLAI/deepsql` | Read-only data boundary, governed definitions, inspectable query/provenance, self-contained HTML output pattern | Credentials in renderer, arbitrary SQL, index application, full backend embedding |
| `dmmulroy/anti-slop` | Evidence-backed assertions, no chained casts, prevent type widening, safety comments, vendored reviewed rules | Enabling every opinionated rule blindly; banning legitimate `unknown` at trust boundaries |
| `deepseek-ai/deepseek-harness` | Capability seams, explicit providers, inspectable effective configuration, scoped lifecycle | Runtime dependency, release-candidate coupling, implicit permissions |
| `yakhyo/uniface` | Future `ImageAnalyzerProvider` seam for crop/quality metadata | Core dependency, biometric identification, model-weight assumptions in this milestone |

## Current codebase facts

- `src/core/types.ts` currently defines render/merge types only.
- `src/core/renderer.ts` owns Playwright rendering and the overflow guard.
- `src/mcp/server.ts` exposes only `generate_pdf` and accepts raw HTML pages for `slides | docs`.
- `bin/pdf-forge.ts` dispatches a fixed map of script-backed commands.
- `src/core/manifest.ts` writes the existing social manifest; it is not the new document-composition manifest and should not be overloaded.
- `assets/templates/` contains 36 HTML/template assets; these remain valid and can seed registry entries incrementally.
- `assets/themes/` contains seven YAML themes plus documentation; token shapes are not yet normalized across a runtime schema.
- CI currently runs one browserless unit file in `check`, then the whole test tree with Chromium in `integration`.
- Strict TypeScript is enabled, but current boundary code contains assertions and broad dictionaries that a full anti-slop configuration would flag.

## Proposed directory layout

```text
src/
  registry/
    schemas.ts
    types.ts
    loader.ts
    resolver.ts
    compose.ts
    receipt.ts
  data/
    schemas.ts
    types.ts
    canonicalize.ts
    limits.ts
    redact.ts
    providers/
      static-json.ts
      deepsql.ts
  mcp/
    server.ts
scripts/
  registry-list.ts
  registry-inspect.ts
  compose-document.ts
  generate-gallery.ts
assets/
  registry/
    registry.yaml
    primitives/
      metric-card/
        component.html
        schema.json
        example.json
    blocks/
      executive-report/
        block.yaml
        template.html
        example.json
  themes/
    ...existing themes...
tests/
  registry/
  data/
  mcp/
  scripts/
tools/oxlint/anti-slop/
docs/adr/
```

## Public contracts

### Document manifest

```ts
export const DocumentManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  documentId: z.string().min(1),
  format: z.enum(["slides", "docs", "social"]),
  theme: z.string().min(1),
  pages: z.array(
    z.object({
      block: z.string().min(1),
      props: z.record(z.string(), z.json()),
    }).strict()
  ).min(1),
  dataSnapshot: z.string().min(1).optional(),
}).strict();
```

`props` is untrusted only at the manifest boundary. Each selected registry item must parse it with its own schema before composition; domain code must not retain `Record<string, unknown>` as its final contract.

### Data snapshot

```ts
export const DataSnapshotSchema = z.object({
  schemaVersion: z.literal("1"),
  id: z.string().min(1),
  source: z.object({
    provider: z.string().min(1),
    connectionRef: z.string().min(1).optional(),
    queryId: z.string().min(1).optional(),
  }).strict(),
  capturedAt: z.iso.datetime(),
  columns: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["string", "number", "boolean", "date", "null"]),
  }).strict()),
  rows: z.array(z.array(z.json())),
  provenance: z.object({
    mode: z.literal("read-only"),
    statementDigest: z.string().min(1).optional(),
  }).strict(),
}).strict();
```

### Provider seam

```ts
export interface DataProvider<Request> {
  readonly id: string;
  fetch(request: Request, signal?: AbortSignal): Promise<DataSnapshot>;
}
```

The provider owns acquisition. Registry composition receives only a parsed `DataSnapshot` and has no network/database capability.

### Build receipt

```ts
export interface BuildReceipt {
  schemaVersion: "1";
  documentId: string;
  registryVersion: string;
  format: Format;
  theme: string;
  componentIds: readonly string[];
  snapshotSha256?: string;
  generatedAt: string;
  output: {
    path: string;
    pageCount: number;
    fileSize: string;
  };
  warnings: readonly string[];
}
```

`generatedAt` is metadata and must not participate in deterministic snapshot hashing.

---

## Task-by-task implementation plan

### Task 1: Record the architecture decision

**Objective:** Freeze boundaries and non-goals before code creates accidental coupling.

**Files:**
- Create: `docs/adr/0001-typed-registry-and-governed-data.md`
- Test: `tests/architecture/adr-contract.test.ts`

**Step 1: Write failing test**

Create a test that reads the ADR and requires the phrases:

```ts
expect(adr).toContain("Playwright remains the default renderer");
expect(adr).toContain("composition never receives database credentials");
expect(adr).toContain("direct HTML remains supported");
expect(adr).toContain("read-only");
```

**Step 2: Verify RED**

Run:

```bash
bun test tests/architecture/adr-contract.test.ts
```

Expected: FAIL because the ADR does not exist.

**Step 3: Write the ADR**

Document context, decision, alternatives, consequences, security boundaries, rollout and rollback. Explicitly state that Takumi/Forme, direct SQL and UniFace are deferred.

**Step 4: Verify GREEN**

Run the same test. Expected: PASS.

**Step 5: Commit**

```bash
git add docs/adr/0001-typed-registry-and-governed-data.md tests/architecture/adr-contract.test.ts
git commit -m "docs: define registry and governed data boundaries"
```

### Task 2: Establish an anti-slop baseline without changing behavior

**Objective:** Add evidence-oriented linting as an observable report before enforcing it.

**Files:**
- Create: `tools/oxlint/anti-slop/` with reviewed vendored rules and MIT notice
- Create: `oxlint.config.ts`
- Modify: `package.json`
- Create: `tests/tooling/anti-slop-config.test.ts`

**Step 1: Write failing test**

Assert that configuration enables this initial subset:

```text
no-chained-type-assertions
no-known-value-widening
no-widen-then-assert
no-object-parameters
require-safety-comment-for-type-assertion
```

Require legitimate boundary directories to remain linted; ignore only agent assets and the vendored plugin itself.

**Step 2: Verify RED**

```bash
bun test tests/tooling/anti-slop-config.test.ts
```

Expected: FAIL because no config exists.

**Step 3: Vendor the pinned rules**

Copy from a reviewed fixed commit, retain MIT attribution, and add:

```json
"lint:anti-slop": "oxlint -c oxlint.config.ts src bin scripts tests"
```

Start any currently noisy rule as `warn`; do not suppress individual production files.

**Step 4: Verify GREEN and capture baseline**

```bash
bun test tests/tooling/anti-slop-config.test.ts
bun run lint:anti-slop
```

Expected: test PASS; lint exits successfully with an explicit reviewed warning count.

**Step 5: Commit**

```bash
git add tools/oxlint oxlint.config.ts package.json bun.lock tests/tooling
git commit -m "chore: add reviewed anti-slop lint baseline"
```

### Task 3: Define registry domain schemas

**Objective:** Parse registry entries into closed domain types before any template is read.

**Files:**
- Create: `src/registry/schemas.ts`
- Create: `src/registry/types.ts`
- Create: `tests/registry/schemas.test.ts`

**Step 1: Write failing tests**

Cover:

- valid registry version `1`;
- duplicate IDs rejected by the loader later, not hidden by object keys;
- unsupported entry kind rejected;
- missing template/schema paths rejected;
- unknown top-level fields rejected;
- format/theme arrays non-empty.

Example desired parse:

```ts
const parsed = RegistryEntrySchema.parse({
  id: "metric-card",
  kind: "primitive",
  version: "1.0.0",
  template: "primitives/metric-card/component.html",
  schema: "primitives/metric-card/schema.json",
  formats: ["docs", "slides"],
  themes: ["ivory-editorial"],
});
expect(parsed.id).toBe("metric-card");
```

**Step 2: Verify RED**

```bash
bun test tests/registry/schemas.test.ts
```

Expected: FAIL because modules do not exist.

**Step 3: Implement minimal schemas**

Use Zod discriminated unions for `primitive | block`; export inferred types rather than duplicate interfaces.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/schemas.test.ts
bun run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/schemas.ts src/registry/types.ts tests/registry/schemas.test.ts
git commit -m "feat: define typed registry contracts"
```

### Task 4: Load the registry relative to the package root

**Objective:** Make registry discovery work from source, packed npm execution and external working directories.

**Files:**
- Create: `src/registry/loader.ts`
- Create: `assets/registry/registry.yaml`
- Create: `tests/registry/loader.test.ts`
- Modify if needed: `package.json` files list only after a failing pack test proves omission

**Step 1: Write failing tests**

Test:

- load from an injected temporary root;
- malformed YAML produces an actionable path-bearing error;
- duplicate IDs fail closed;
- missing referenced files fail closed;
- package-root resolution does not use caller `cwd`.

**Step 2: Verify RED**

```bash
bun test tests/registry/loader.test.ts
```

Expected: FAIL.

**Step 3: Implement loader**

Keep I/O in `loader.ts`; schemas remain pure. Return immutable sorted entries and effective registry version.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/loader.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/loader.ts assets/registry/registry.yaml tests/registry/loader.test.ts package.json
git commit -m "feat: load registry from package assets"
```

### Task 5: Add the `metric-card` tracer primitive

**Objective:** Prove one typed primitive can validate props and render deterministic HTML.

**Files:**
- Create: `assets/registry/primitives/metric-card/component.html`
- Create: `assets/registry/primitives/metric-card/schema.json`
- Create: `assets/registry/primitives/metric-card/example.json`
- Modify: `assets/registry/registry.yaml`
- Create: `tests/registry/metric-card.test.ts`

**Step 1: Write failing behavior tests**

Require:

- label and value;
- optional trend as a discriminated object;
- HTML escaping;
- rejection of unknown fields;
- no hard-coded theme colors outside CSS variables.

**Step 2: Verify RED**

```bash
bun test tests/registry/metric-card.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal template and schema**

Use semantic placeholders resolved by the composer; do not add a general-purpose template language.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/metric-card.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add assets/registry tests/registry/metric-card.test.ts
git commit -m "feat: add typed metric card primitive"
```

### Task 6: Add the `data-table` tracer primitive

**Objective:** Render structured columns/rows with strict shape and bounded output.

**Files:**
- Create: `assets/registry/primitives/data-table/component.html`
- Create: `assets/registry/primitives/data-table/schema.json`
- Create: `assets/registry/primitives/data-table/example.json`
- Modify: `assets/registry/registry.yaml`
- Create: `tests/registry/data-table.test.ts`

**Step 1: Write failing tests**

Cover:

- column order preserved;
- row width must equal column count;
- null renders as an explicit em dash;
- HTML is escaped;
- configured max rows is enforced;
- empty table has a defined state.

**Step 2: Verify RED**

```bash
bun test tests/registry/data-table.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal behavior**

Do not add pagination here; report an explicit limit error. Pagination belongs to a later block policy.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/data-table.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add assets/registry tests/registry/data-table.test.ts
git commit -m "feat: add bounded data table primitive"
```

### Task 7: Normalize one theme through a runtime schema

**Objective:** Prove registry components consume semantic theme tokens without migrating all themes at once.

**Files:**
- Create: `src/registry/theme-schema.ts`
- Modify: `assets/themes/ivory-editorial.yaml`
- Create: `tests/registry/theme-schema.test.ts`

**Step 1: Write failing tests**

Require semantic colors, fonts, spacing, radius and page geometry. Parse `ivory-editorial` and reject missing required tokens or invalid colors.

**Step 2: Verify RED**

```bash
bun test tests/registry/theme-schema.test.ts
```

Expected: FAIL.

**Step 3: Implement schema and minimal compatible token additions**

Preserve existing theme keys for backward compatibility; add a normalized `registry_tokens` block rather than deleting current fields.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/theme-schema.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/theme-schema.ts assets/themes/ivory-editorial.yaml tests/registry/theme-schema.test.ts
git commit -m "feat: validate registry theme tokens"
```

### Task 8: Build the minimal registry resolver

**Objective:** Resolve component ID, format, theme, schema and template with fail-closed compatibility checks.

**Files:**
- Create: `src/registry/resolver.ts`
- Create: `tests/registry/resolver.test.ts`

**Step 1: Write failing tests**

Cover unknown ID, incompatible format, incompatible theme, missing asset and successful `metric-card` resolution.

**Step 2: Verify RED**

```bash
bun test tests/registry/resolver.test.ts
```

Expected: FAIL.

**Step 3: Implement resolver**

Return a resolved immutable object. Never fall back to a similarly named component or arbitrary path.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/resolver.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/resolver.ts tests/registry/resolver.test.ts
git commit -m "feat: resolve compatible registry entries"
```

### Task 9: Define the document manifest parser

**Objective:** Establish the untrusted-to-trusted boundary for composition requests.

**Files:**
- Create: `src/registry/document-manifest.ts`
- Create: `tests/registry/document-manifest.test.ts`

**Step 1: Write failing tests**

Test valid manifest, unknown fields, empty pages, invalid format, unsafe block IDs and optional snapshot reference.

**Step 2: Verify RED**

```bash
bun test tests/registry/document-manifest.test.ts
```

Expected: FAIL.

**Step 3: Implement the strict Zod parser**

Expose `parseDocumentManifest(input: unknown): DocumentManifest`; keep `unknown` only at this boundary.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/document-manifest.test.ts
bun run lint:anti-slop
```

Expected: PASS with no chained assertion.

**Step 5: Commit**

```bash
git add src/registry/document-manifest.ts tests/registry/document-manifest.test.ts
git commit -m "feat: parse typed document manifests"
```

### Task 10: Compose one primitive into self-contained HTML

**Objective:** Prove manifest props are validated by the selected entry before HTML generation.

**Files:**
- Create: `src/registry/compose.ts`
- Create: `tests/registry/compose-primitive.test.ts`

**Step 1: Write failing tests**

Require deterministic HTML, escaped values, theme variables, complete document shell and schema-path error messages.

**Step 2: Verify RED**

```bash
bun test tests/registry/compose-primitive.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal composer**

No `eval`, no script execution, no network fetch. Support only explicit placeholders required by tracer primitives.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/compose-primitive.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/compose.ts tests/registry/compose-primitive.test.ts
git commit -m "feat: compose validated primitives to html"
```

### Task 11: Add the `executive-report` block

**Objective:** Prove blocks compose multiple primitives without duplicating validation logic.

**Files:**
- Create: `assets/registry/blocks/executive-report/block.yaml`
- Create: `assets/registry/blocks/executive-report/template.html`
- Create: `assets/registry/blocks/executive-report/example.json`
- Modify: `assets/registry/registry.yaml`
- Create: `tests/registry/executive-report.test.ts`

**Step 1: Write failing test**

The example must produce a report containing a title, summary, metric cards, data table and recommendations. Invalid metric/table data must fail at its primitive schema path.

**Step 2: Verify RED**

```bash
bun test tests/registry/executive-report.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal block composition**

Reference primitive IDs in `block.yaml`; do not inline their HTML.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/executive-report.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add assets/registry tests/registry/executive-report.test.ts
git commit -m "feat: add executive report block"
```

### Task 12: Render the registry tracer block through Playwright

**Objective:** Verify the new layer ends at the existing renderer rather than creating a second engine.

**Files:**
- Create: `tests/integration/registry-executive-report.test.ts`
- Modify only if required by the test: `src/registry/compose.ts`

**Step 1: Write failing integration test**

Compose the canonical example, write HTML to a temp directory, call `renderPages`, call `mergePages`, load output with pdf-lib and assert page count and `%PDF-` header.

**Step 2: Verify RED**

```bash
bun test tests/integration/registry-executive-report.test.ts --timeout 60000
```

Expected: FAIL before the integration glue exists.

**Step 3: Add only the missing glue**

Do not modify `src/core/renderer.ts` unless the failing behavior proves a renderer contract gap.

**Step 4: Verify GREEN**

Run the same test. Expected: PASS with a valid PDF.

**Step 5: Commit**

```bash
git add tests/integration/registry-executive-report.test.ts src/registry/compose.ts
git commit -m "test: prove registry output through playwright"
```

### Task 13: Define `DataSnapshot` and limits

**Objective:** Create the governed, serializable data contract consumed by composition.

**Files:**
- Create: `src/data/schemas.ts`
- Create: `src/data/types.ts`
- Create: `src/data/limits.ts`
- Create: `tests/data/snapshot.test.ts`

**Step 1: Write failing tests**

Cover:

- valid read-only snapshot;
- row width mismatch;
- duplicate columns;
- unsupported cell type;
- maximum rows, columns and encoded bytes;
- missing captured timestamp;
- mode other than `read-only` rejected.

**Step 2: Verify RED**

```bash
bun test tests/data/snapshot.test.ts
```

Expected: FAIL.

**Step 3: Implement strict schemas and limits**

Default limits must be explicit constants and overridable only by a trusted host configuration, not by the document manifest.

**Step 4: Verify GREEN**

```bash
bun test tests/data/snapshot.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data tests/data/snapshot.test.ts
git commit -m "feat: define bounded read-only data snapshots"
```

### Task 14: Canonicalize and hash snapshots

**Objective:** Produce a stable SHA-256 digest independent of object key insertion order.

**Files:**
- Create: `src/data/canonicalize.ts`
- Create: `tests/data/canonicalize.test.ts`

**Step 1: Write failing tests**

Require equivalent snapshots with different object key order to hash identically; row order changes must change the digest; volatile receipt timestamps must not be part of the snapshot hash.

**Step 2: Verify RED**

```bash
bun test tests/data/canonicalize.test.ts
```

Expected: FAIL.

**Step 3: Implement canonical JSON and SHA-256**

Use Node `crypto`; do not invent a custom non-cryptographic digest.

**Step 4: Verify GREEN**

```bash
bun test tests/data/canonicalize.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/canonicalize.ts tests/data/canonicalize.test.ts
git commit -m "feat: hash canonical data snapshots"
```

### Task 15: Define the provider capability seam

**Objective:** Separate data acquisition from composition and make providers replaceable without a plugin runtime dependency.

**Files:**
- Create: `src/data/provider.ts`
- Create: `src/data/provider-registry.ts`
- Create: `tests/data/provider-registry.test.ts`

**Step 1: Write failing tests**

Require unique provider IDs, explicit registration/removal, unknown provider rejection and abort signal propagation.

**Step 2: Verify RED**

```bash
bun test tests/data/provider-registry.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal registry**

Use scoped object ownership; avoid global mutable singletons. This is the DeepSeek Harness-inspired capability seam.

**Step 4: Verify GREEN**

```bash
bun test tests/data/provider-registry.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/provider.ts src/data/provider-registry.ts tests/data/provider-registry.test.ts
git commit -m "feat: add scoped data provider capability"
```

### Task 16: Implement `StaticJsonProvider`

**Objective:** Prove the provider path without network, credentials or DeepSQL.

**Files:**
- Create: `src/data/providers/static-json.ts`
- Create: `tests/data/static-json-provider.test.ts`

**Step 1: Write failing tests**

Test valid file, malformed JSON, schema failure, file-size limit and path passed explicitly by trusted caller.

**Step 2: Verify RED**

```bash
bun test tests/data/static-json-provider.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal provider**

Read, parse, validate and return. No directory crawling or fallback search.

**Step 4: Verify GREEN**

```bash
bun test tests/data/static-json-provider.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/providers/static-json.ts tests/data/static-json-provider.test.ts
git commit -m "feat: add static json data provider"
```

### Task 17: Add explicit redaction before composition

**Objective:** Prevent configured sensitive columns from entering block props or receipts.

**Files:**
- Create: `src/data/redact.ts`
- Create: `tests/data/redact.test.ts`

**Step 1: Write failing tests**

Cover exact column-name matching, absent columns, replacement marker, immutable input and receipt exclusion. Do not infer PII automatically in v1.

**Step 2: Verify RED**

```bash
bun test tests/data/redact.test.ts
```

Expected: FAIL.

**Step 3: Implement deterministic redaction**

Use an explicit host-supplied allow/deny policy. Preserve column structure so downstream blocks remain stable.

**Step 4: Verify GREEN**

```bash
bun test tests/data/redact.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/redact.ts tests/data/redact.test.ts
git commit -m "feat: redact configured snapshot columns"
```

### Task 18: Bind snapshots to executive-report props

**Objective:** Convert one validated snapshot into the existing typed block contract.

**Files:**
- Create: `src/data/bindings/executive-report.ts`
- Create: `tests/data/executive-report-binding.test.ts`

**Step 1: Write failing tests**

Use a small canonical dataset and assert exact metrics/table/recommendation props. Missing required columns must fail with names, not silently produce empty values.

**Step 2: Verify RED**

```bash
bun test tests/data/executive-report-binding.test.ts
```

Expected: FAIL.

**Step 3: Implement one explicit binding**

Do not build a general expression language. The first binding is named and typed.

**Step 4: Verify GREEN**

```bash
bun test tests/data/executive-report-binding.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/bindings/executive-report.ts tests/data/executive-report-binding.test.ts
git commit -m "feat: bind snapshots to executive reports"
```

### Task 19: Produce a verified build receipt

**Objective:** Link document, registry, components, snapshot digest and final PDF metadata.

**Files:**
- Create: `src/registry/receipt.ts`
- Create: `tests/registry/receipt.test.ts`

**Step 1: Write failing tests**

Require sorted unique component IDs, snapshot hash, output metadata, warning list and no secret/provider token fields. Verify the digest by recomputing it from fixture bytes.

**Step 2: Verify RED**

```bash
bun test tests/registry/receipt.test.ts
```

Expected: FAIL.

**Step 3: Implement receipt builder**

Accept verified outputs from `mergePages`; do not trust a provider-supplied file count or size.

**Step 4: Verify GREEN**

```bash
bun test tests/registry/receipt.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/registry/receipt.ts tests/registry/receipt.test.ts
git commit -m "feat: emit auditable pdf build receipts"
```

### Task 20: Add `registry list` and `registry inspect` CLI commands

**Objective:** Make the effective registry discoverable without reading source files.

**Files:**
- Create: `scripts/registry-list.ts`
- Create: `scripts/registry-inspect.ts`
- Modify: `bin/pdf-forge.ts`
- Create: `tests/scripts/registry-cli.test.ts`

**Step 1: Write failing CLI tests**

Assert help output, stable JSON mode, unknown ID exit code `2`, external `cwd` behavior and no absolute package paths in normal output.

**Step 2: Verify RED**

```bash
bun test tests/scripts/registry-cli.test.ts
```

Expected: FAIL.

**Step 3: Add minimal command routing**

Prefer a dedicated branch for nested `registry` commands rather than forcing them into the flat `ENGINE_COMMANDS` map.

**Step 4: Verify GREEN**

```bash
bun test tests/scripts/registry-cli.test.ts
bun test tests/scripts/pdf-forge-cli.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/registry-list.ts scripts/registry-inspect.ts bin/pdf-forge.ts tests/scripts
git commit -m "feat: expose registry discovery in cli"
```

### Task 21: Add `compose` CLI with StaticJsonProvider

**Objective:** Deliver the first complete user-facing data-backed document path.

**Files:**
- Create: `scripts/compose-document.ts`
- Modify: `bin/pdf-forge.ts`
- Create: `tests/scripts/compose-cli.test.ts`
- Create: `tests/fixtures/data/executive-report-snapshot.json`

**Step 1: Write failing test**

Invoke:

```bash
pdf-forge compose executive-report \
  --data tests/fixtures/data/executive-report-snapshot.json \
  --theme ivory-editorial \
  --output output.pdf \
  --receipt output.receipt.json
```

Assert valid PDF, valid receipt and matching snapshot digest.

**Step 2: Verify RED**

```bash
bun test tests/scripts/compose-cli.test.ts --timeout 60000
```

Expected: FAIL.

**Step 3: Implement minimal orchestration**

Order: provider fetch → snapshot parse/limits → redaction → binding → manifest parse → compose → render → merge → receipt write.

**Step 4: Verify GREEN**

Run the same test. Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/compose-document.ts bin/pdf-forge.ts tests/scripts/compose-cli.test.ts tests/fixtures
git commit -m "feat: compose data-backed reports from cli"
```

### Task 22: Expose registry discovery over MCP

**Objective:** Let agents inspect capabilities before choosing blocks.

**Files:**
- Modify: `src/mcp/server.ts`
- Modify: `tests/mcp/server.test.ts`

**Step 1: Write failing MCP tests**

Require tools:

```text
list_pdf_components
inspect_pdf_component
validate_pdf_manifest
```

Test actual in-memory calls and structured error results.

**Step 2: Verify RED**

```bash
bun test tests/mcp/server.test.ts
```

Expected: FAIL because tools are absent.

**Step 3: Register read-only tools**

Keep schemas strict and responses machine-readable. Discovery tools must not render or write files.

**Step 4: Verify GREEN**

```bash
bun test tests/mcp/server.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/server.test.ts
git commit -m "feat: expose registry discovery over mcp"
```

### Task 23: Expose structured composition over MCP

**Objective:** Add `compose_pdf` without altering the existing `generate_pdf` raw-HTML contract.

**Files:**
- Modify: `src/mcp/server.ts`
- Create: `tests/mcp/compose-pdf.test.ts`

**Step 1: Write failing tests**

Cover:

- valid embedded snapshot;
- invalid manifest fails before temp directory/render;
- size limit rejection;
- output contains receipt;
- `generate_pdf` still exists and behaves unchanged.

**Step 2: Verify RED**

```bash
bun test tests/mcp/compose-pdf.test.ts tests/mcp/server.test.ts
```

Expected: FAIL.

**Step 3: Implement `compose_pdf`**

V1 accepts an embedded already-governed snapshot or trusted local snapshot path. Do not accept connection strings, API keys or arbitrary SQL.

**Step 4: Verify GREEN**

```bash
bun test tests/mcp/compose-pdf.test.ts tests/mcp/server.test.ts --timeout 60000
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/mcp/server.ts tests/mcp/compose-pdf.test.ts tests/mcp/server.test.ts
git commit -m "feat: compose typed reports over mcp"
```

### Task 24: Specify the DeepSQL adapter request/response contract

**Objective:** Freeze what PDF Forge is willing to receive from DeepSQL before implementing transport.

**Files:**
- Create: `docs/integrations/deepsql.md`
- Create: `src/data/providers/deepsql-contract.ts`
- Create: `tests/data/deepsql-contract.test.ts`

**Step 1: Write failing contract tests**

Require:

- `read-only` mode;
- rows/columns/provenance;
- no credentials in response;
- optional query ID/digest, not raw connection secret;
- explicit freshness timestamp;
- unsupported/mutating operation rejected.

**Step 2: Verify RED**

```bash
bun test tests/data/deepsql-contract.test.ts
```

Expected: FAIL.

**Step 3: Implement schema and documentation**

Document two deployment modes: host fetches snapshot and passes it to PDF Forge (recommended); optional adapter calls a fixed DeepSQL endpoint with host-owned auth (later).

**Step 4: Verify GREEN**

```bash
bun test tests/data/deepsql-contract.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/integrations/deepsql.md src/data/providers/deepsql-contract.ts tests/data/deepsql-contract.test.ts
git commit -m "docs: define safe deepsql snapshot contract"
```

### Task 25: Implement a disabled-by-default DeepSQL HTTP adapter

**Objective:** Fetch only a pre-approved read-only query/result through a fixed host configuration.

**Files:**
- Create: `src/data/providers/deepsql.ts`
- Create: `tests/data/deepsql-provider.test.ts`

**Step 1: Write failing tests with a local fake HTTP boundary**

Test fixed base URL, authorization header injection from host config, timeout/abort, non-2xx, oversized body, mutating mode rejection and successful schema parse. Assert tokens never appear in errors.

**Step 2: Verify RED**

```bash
bun test tests/data/deepsql-provider.test.ts
```

Expected: FAIL.

**Step 3: Implement minimal adapter**

Constructor receives trusted configuration:

```ts
new DeepSqlProvider({
  baseUrl,
  authToken,
  timeoutMs,
  allowedQueryIds,
});
```

Requests from documents may select only an allowlisted query ID and parameters validated by host policy. No raw SQL field.

**Step 4: Verify GREEN**

```bash
bun test tests/data/deepsql-provider.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/data/providers/deepsql.ts tests/data/deepsql-provider.test.ts
git commit -m "feat: add gated deepsql snapshot provider"
```

### Task 26: Add effective configuration inspection

**Objective:** Make providers, limits and registry versions observable without exposing secrets.

**Files:**
- Create: `src/core/effective-config.ts`
- Modify: `bin/pdf-forge.ts`
- Create: `tests/core/effective-config.test.ts`

**Step 1: Write failing tests**

Require provider IDs, enabled state, limits, registry version and redacted secret presence as `[REDACTED]`; raw tokens must never appear.

**Step 2: Verify RED**

```bash
bun test tests/core/effective-config.test.ts
```

Expected: FAIL.

**Step 3: Implement `pdf-forge doctor --json` slice**

This applies the DeepSeek Harness inspectability pattern without importing its runtime.

**Step 4: Verify GREEN**

```bash
bun test tests/core/effective-config.test.ts
bun run bin/pdf-forge.ts doctor --json
```

Expected: PASS; output contains no secrets.

**Step 5: Commit**

```bash
git add src/core/effective-config.ts bin/pdf-forge.ts tests/core/effective-config.test.ts
git commit -m "feat: inspect effective pdf forge capabilities"
```

### Task 27: Generate a canonical component gallery

**Objective:** Make shipped components and blocks discoverable through real rendered previews.

**Files:**
- Create: `scripts/generate-gallery.ts`
- Create: `tests/scripts/generate-gallery.test.ts`
- Create: `docs/registry/README.md`
- Generated during verification: `.artifacts/registry-gallery/` (do not commit unless policy explicitly chooses it)

**Step 1: Write failing test**

Require every registry entry to have an example, rendered preview, metadata section and link to schema. Missing preview generation must fail.

**Step 2: Verify RED**

```bash
bun test tests/scripts/generate-gallery.test.ts --timeout 60000
```

Expected: FAIL.

**Step 3: Implement gallery generator**

Generate from the canonical registry/examples; never use hand-created screenshots as evidence.

**Step 4: Verify GREEN**

```bash
bun test tests/scripts/generate-gallery.test.ts --timeout 60000
bun run scripts/generate-gallery.ts --output .artifacts/registry-gallery
```

Expected: PASS and a browsable gallery.

**Step 5: Commit**

```bash
git add scripts/generate-gallery.ts tests/scripts/generate-gallery.test.ts docs/registry/README.md
git commit -m "feat: generate registry gallery from fixtures"
```

### Task 28: Add package and external-CWD coverage

**Objective:** Verify registry/data assets ship in npm and commands work outside the repository.

**Files:**
- Modify: `tests/integration/npm-pack-cli.test.ts`
- Modify: `tests/integration/pdf-forge-cli-smoke.test.ts`
- Modify if failing: `package.json`, `tsup.config.ts`

**Step 1: Add failing integration tests**

Pack/install tarball in a temp project, run `registry list`, inspect `executive-report`, compose from a fixture and validate the PDF/receipt.

**Step 2: Verify RED**

```bash
bun test tests/integration/npm-pack-cli.test.ts tests/integration/pdf-forge-cli-smoke.test.ts --timeout 60000
```

Expected: FAIL until assets/dist exports are complete.

**Step 3: Fix only proven packaging gaps**

Avoid exporting internal provider implementations unless required by a documented public API.

**Step 4: Verify GREEN**

Run the same tests. Expected: PASS.

**Step 5: Commit**

```bash
git add package.json tsup.config.ts tests/integration
git commit -m "test: verify packaged registry and composition cli"
```

### Task 29: Promote clean anti-slop rules to CI errors

**Objective:** Turn the reviewed evidence rules into enforced gates after the touched code is clean.

**Files:**
- Modify: `oxlint.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify only touched boundary files needed to remove actual violations

**Step 1: Write/update failing config test**

Assert selected rules are `error`, not `warn`, and CI runs `bun run lint:anti-slop` before typecheck.

**Step 2: Verify RED**

```bash
bun test tests/tooling/anti-slop-config.test.ts
```

Expected: FAIL while rules remain warnings/CI omits lint.

**Step 3: Promote the reviewed subset**

Keep legitimate `unknown` at parse boundaries. Do not enable `no-unknown-parameters` globally. Configure `no-runtime-typeof` only if type guards are explicitly allowed and baseline is clean.

**Step 4: Verify GREEN**

```bash
bun run lint:anti-slop
bun run typecheck
bun test tests/tooling/anti-slop-config.test.ts
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add oxlint.config.ts .github/workflows/ci.yml package.json src bin scripts tests/tooling
git commit -m "ci: enforce evidence-backed typescript boundaries"
```

### Task 30: Complete end-to-end acceptance verification

**Objective:** Prove the two integrations work together on final repository state.

**Files:**
- Create: `tests/integration/data-backed-executive-report.test.ts`
- Create: `tests/fixtures/data/deepsql-executive-report-response.json`
- Create: `.hermes/handoffs/YYYY-MM-DD-pdf-forge-registry-deepsql.md` during implementation closeout

**Step 1: Write the final failing acceptance test**

Use the DeepSQL contract fixture, validate to `DataSnapshot`, hash, bind, compose, render, merge and build receipt. Assert:

- query mode is read-only;
- no credential fields occur in snapshot, HTML, PDF-extracted metadata or receipt;
- receipt hash equals recomputed canonical hash;
- registry/component IDs are exact;
- PDF loads and has at least one page;
- direct `generate_pdf` MCP test remains green.

**Step 2: Verify RED**

```bash
bun test tests/integration/data-backed-executive-report.test.ts --timeout 60000
```

Expected: FAIL until all final wiring exists.

**Step 3: Add only missing final wiring**

No refactor or new feature in this task.

**Step 4: Run final verification**

```bash
bun run lint:anti-slop
bun run typecheck
bun run build
bun test tests/core/utils.test.ts
bun test tests/ --parallel=1 --timeout 60000
```

Expected:

- lint: zero errors;
- typecheck: exit 0;
- build: exit 0;
- browserless unit gate: PASS;
- full suite: PASS;
- acceptance PDF and receipt generated in temp test storage and independently validated.

**Step 5: Review final diff**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD
```

Read the complete diff. Confirm no unrelated refactor, no renderer replacement, no credentials, no arbitrary SQL and no generated artifacts accidentally committed.

**Step 6: Write handoff**

Record objective, decisions, tests with real outputs, known limitations, rollback and next action.

**Step 7: Commit**

```bash
git add tests/integration/data-backed-executive-report.test.ts tests/fixtures .hermes/handoffs
git commit -m "test: verify governed data to pdf pipeline"
```

---

## Deferred follow-ups

### UniFace image-analysis provider

Only after the registry/data milestone is stable, consider:

```ts
export interface ImageAnalyzerProvider {
  readonly id: string;
  analyze(input: ImageInput, signal?: AbortSignal): Promise<ImageAnalysis>;
}
```

Possible non-biometric uses:

- face-safe crop region;
- blur/quality score;
- head pose for composition;
- background segmentation metadata.

Gates before implementation:

- inspect every model-weight license;
- prohibit identity recognition by default;
- keep images local unless explicitly configured;
- define retention/deletion policy;
- test no raw biometric vectors enter receipts or logs.

This is not part of the two core integrations and must not block them.

### Alternative PDF renderers

Takumi/Forme remain research-only. A separate benchmark must compare fidelity, font loading, pagination, charts, performance and maintenance against Playwright. An ADR and explicit approval are required before a production provider is added.

### Additional blocks

After the tracer bullet proves the architecture, add blocks one at a time with their own schemas/tests:

- commercial proposal;
- technical report;
- financial report;
- marketing report;
- operations report;
- security report;
- invoice;
- timeline;
- comparison;
- appendix/FAQ.

Do not create all blocks in the foundational PR.

## Files likely to change across the full milestone

### Existing

- `package.json`
- `tsup.config.ts`
- `bin/pdf-forge.ts`
- `src/mcp/server.ts`
- `.github/workflows/ci.yml`
- `assets/themes/ivory-editorial.yaml`
- `tests/mcp/server.test.ts`
- `tests/scripts/pdf-forge-cli.test.ts`
- `tests/integration/npm-pack-cli.test.ts`
- `tests/integration/pdf-forge-cli-smoke.test.ts`
- `README.md`
- `skills/pdf-forge/SKILL.md` only after CLI/MCP behavior is stable and verified

### New

- `src/registry/**`
- `src/data/**`
- `assets/registry/**`
- `scripts/registry-list.ts`
- `scripts/registry-inspect.ts`
- `scripts/compose-document.ts`
- `scripts/generate-gallery.ts`
- `tools/oxlint/anti-slop/**`
- `oxlint.config.ts`
- `docs/adr/0001-typed-registry-and-governed-data.md`
- `docs/integrations/deepsql.md`
- `docs/registry/README.md`
- `tests/registry/**`
- `tests/data/**`
- `tests/tooling/**`
- `tests/architecture/**`
- `tests/integration/data-backed-executive-report.test.ts`

## Rollout sequence

1. **PR 1 — Contracts and tracer registry:** Tasks 1–12. No DeepSQL and no public API promise beyond experimental registry commands.
2. **PR 2 — Governed snapshots:** Tasks 13–19. Static provider only.
3. **PR 3 — CLI/MCP surfaces:** Tasks 20–23. Preserve `generate_pdf` unchanged.
4. **PR 4 — DeepSQL adapter:** Tasks 24–26. Disabled by default; allowlisted query IDs only.
5. **PR 5 — Gallery, packaging and gates:** Tasks 27–30.

Each PR must be independently revertible. Do not combine renderer refactors, theme-wide migration or unrelated template work.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Registry becomes a second frontend framework | Minimal placeholder compiler; no React/runtime framework; one tracer block first |
| Component schemas pretend to type unvalidated data | Zod parse at every boundary; anti-slop gates; no chained assertions |
| DeepSQL introduces database mutation | Accept snapshots or allowlisted query IDs only; require `read-only`; no raw SQL in document/MCP contract |
| Credentials leak into errors/receipts | Host-owned auth; redaction tests; effective config always `[REDACTED]` |
| Generated HTML accesses network | Self-contained assets; browser request policy in a later dedicated hardening task if current renderer permits remote fonts |
| Snapshot hash is unstable | Canonical JSON tests; exclude volatile receipt metadata |
| Large datasets exhaust memory/rendering | Row/column/byte/time limits before binding and rendering |
| Existing HTML consumers break | Keep `generate_pdf`, direct HTML and renderer contracts unchanged; regression tests |
| Anti-slop creates false positives | Reviewed subset, warn-first rollout, preserve legitimate `unknown` at trust boundaries |
| Public API expands too early | Experimental namespace/commands until tracer and package tests are green |
| Source project drift | Pin source commits for vendored rules; record origin/license; do not depend on remote runtime behavior |

## Open questions requiring a decision before Task 25

1. Which DeepSQL transport is canonical for PDF Forge: host-exported snapshot file, DeepSQL REST endpoint, or a dedicated MCP-to-MCP bridge? **Recommended:** snapshot file first; fixed REST adapter second.
2. Which DeepSQL query identifiers may be used in the first real environment? This must be an explicit allowlist owned outside document manifests.
3. Should receipts be emitted beside every output by default or only with `--receipt`? **Recommended:** always for `compose`, optional for legacy `generate_pdf`.
4. Are remote Google Fonts allowed during composed renders? Current themes reference them. For deterministic/air-gapped reports, package fonts or add a network policy phase.
5. Should registry entries be public API in v0.4 or experimental until two blocks ship? **Recommended:** experimental through the tracer milestone.

## Final acceptance checklist

- [ ] Direct HTML rendering remains unchanged.
- [ ] Playwright remains the only production renderer.
- [ ] Registry and block inputs are parsed before composition.
- [ ] `metric-card`, `data-table`, and `executive-report` ship with schemas/examples/tests.
- [ ] Data acquisition and composition are separate capabilities.
- [ ] Static snapshot path works without network.
- [ ] DeepSQL path accepts only read-only governed data or allowlisted query IDs.
- [ ] No database credential appears in manifests, HTML, logs, errors, PDFs or receipts.
- [ ] Receipt snapshot hash independently verifies.
- [ ] CLI and MCP expose discovery and typed composition.
- [ ] Existing MCP `generate_pdf` stays compatible.
- [ ] Packed npm execution works from an external working directory.
- [ ] Selected anti-slop rules pass as CI errors.
- [ ] Full diff reviewed.
- [ ] Full real test outputs preserved in handoff.

## Rollback

- Disable `compose` and DeepSQL provider registration while leaving legacy commands untouched.
- Revert PRs in reverse order; each rollout PR must avoid cross-PR migrations that prevent rollback.
- Registry assets are additive. Removing command exposure must not affect `render`, `merge`, `pptx`, existing MCP `generate_pdf`, skill symlinks or current templates.
- Never delete existing templates/themes during this milestone; migration is copy-and-verify only.
