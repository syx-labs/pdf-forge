# DeepSQL request/response boundary

## Status and scope

This document freezes the version `1` data contract that PDF Forge is willing to exchange at a DeepSQL-compatible boundary. It defines validation and deployment constraints; it does **not** claim that any particular upstream DeepSQL product, endpoint, authentication scheme, or query feature implements this contract.

Acquisition remains outside document composition. Templates, manifests, generated HTML, and the renderer receive only a validated response snapshot. Task 25 may add transport and mapping behind this boundary, but transport is not enabled by this contract.

## Architecture

```text
host policy + host-owned auth
          |
          v
approved read-only acquisition ----> untrusted response bytes
          |                                  |
          |                                  v
          |                    strict DeepSQL contract parser
          |                                  |
          |                                  v
          +------------------------> immutable bounded snapshot
                                             |
                                             v
                                    PDF Forge composition
```

The host owns endpoint selection, credentials, query allowlists, parameter policy, timeout, cancellation, and egress controls. PDF Forge owns closed-schema parsing and canonical snapshot validation. The response parser reuses the canonical `DataSnapshot` column, scalar, row-width, type, duplicate-column, row-count, column-count, and encoded-size semantics; it does not create a second domain interface.

## Deployment modes

### Mode 1 — Host-fetched snapshot (recommended)

The host executes an approved governed query, validates and redacts the result, builds the versioned response below, and passes that inert snapshot to PDF Forge. PDF Forge performs no network access and never receives connection or authentication material. This is the recommended production shape because acquisition authority stays with the host and the document process handles data only.

### Mode 2 — Optional fixed-endpoint adapter

A later optional adapter may call one fixed DeepSQL endpoint selected in trusted host configuration. Authentication remains host-owned and is injected only into the outbound transport; it is never accepted from a document, manifest, request payload, or response. The adapter is **disabled by default** in Task 25 and must not support document-controlled URLs, connection profiles, headers, or fallback endpoints.

Enabling this mode requires host review of its endpoint allowlist, authentication scope, `AbortSignal` propagation, timeout, response-size cap, redirect policy, and egress audit. A failure, cancellation, stale result, policy rejection, or malformed response fails closed and produces no partial snapshot.

## Version 1 request

```json
{
  "schemaVersion": "1",
  "operation": "query",
  "mode": "read-only",
  "queryId": "monthly-revenue",
  "parameters": {
    "region": "south",
    "month": 8,
    "active": true,
    "owner": null
  }
}
```

The root is strict. Its complete field set is:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `"1"`. |
| `operation` | Literal `"query"`; mutation and unsupported operations are rejected. |
| `mode` | Literal `"read-only"`. |
| `queryId` | Required safe identifier, at most 128 characters. It selects a host allowlisted query; it is not query text. |
| `parameters` | Optional record of at most 64 host-governed scalar values. |

Parameter names use the same bounded safe-identifier shape (maximum 128 characters). Names reserved for SQL, query text, authentication, credentials, tokens, passwords, API keys, and connection strings are rejected. Values are only string, finite number, boolean, or `null`; objects, arrays, non-finite numbers, and strings longer than 4096 characters are rejected. Accepted strings remain inert data: the contract does not guess whether business text is SQL or a secret. The host policy must validate each parameter semantically and must never concatenate values into SQL.

The host policy validates parameters before acquisition: it decides which parameters each `queryId` accepts, their business types and ranges, and any tenant or authorization binding. Passing structural validation does not grant query authority.

## Version 1 response

```json
{
  "schemaVersion": "1",
  "mode": "read-only",
  "snapshotId": "snapshot-2026-08-17",
  "columns": [
    { "name": "region", "type": "string" },
    { "name": "revenue", "type": "number" }
  ],
  "rows": [["south", 1250.5]],
  "provenance": {
    "sourceRef": "deepsql/reports/monthly-revenue",
    "freshnessAt": "2026-08-17T10:30:00+00:00",
    "queryId": "monthly-revenue",
    "queryDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
}
```

The root, every column, and `provenance` are strict objects. Unknown fields fail validation.

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `"1"`. |
| `mode` | Literal `"read-only"`. |
| `snapshotId` | Required safe identifier, at most 128 characters. |
| `columns` | Canonical strict `{name, type}` columns. Types are `string`, `number`, `boolean`, or `null`; names are unique and secret/query-control names are rejected. |
| `rows` | Scalar arrays whose widths and cell types exactly match `columns`. Nested values and non-finite numbers are rejected. String cells remain inert report data and are never interpreted as SQL, credentials, or instructions. |
| `provenance.sourceRef` | Required opaque source identifier, at most 256 characters. SQL verbs, credential labels, URLs carrying connection material, and unsafe characters are rejected. |
| `provenance.freshnessAt` | Required ISO 8601 timestamp with explicit `Z` or numeric timezone offset. |
| `provenance.queryId` | Optional safe allowlisted-query identifier. |
| `provenance.queryDigest` | Optional lowercase 64-hex SHA-256 digest of the host-defined governed query identity/version. It is not raw query text. |

Responses use the canonical default ceilings: 10,000 rows, 100 columns, and 5,242,880 serialized UTF-8 bytes. The parser returns a serializable, deeply frozen copy and does not mutate its input.

## Threat model and security invariants

The boundary treats both request and response bytes as untrusted. It is designed to fail closed against query escalation, mutation attempts, credential exfiltration, SQL injection through control fields, stale or misattributed data, oversized payloads, schema smuggling, SSRF/redirect expansion, and secret disclosure through diagnostics.

The invariants are:

- **No raw SQL.** Documents and callers select only allowlisted query IDs. SQL or a generic raw `query` field is never part of the request, response, provenance, document, or receipt contract.
- **No credentials in documents, responses, receipts, or logs.** Tokens, API keys, authorization values, connection strings, passwords, credential objects, and host authentication headers stay outside control fields and sanitized errors. Because report strings are inert data rather than instructions, the host must prevent sensitive values at acquisition and apply explicit redaction policy before composition; the parser does not guess from text content.
- **Read-only only.** Both operation and response mode are literals; mutation and unsupported operations are rejected before transport or composition.
- **Host authority.** The host owns allowlisted query IDs, endpoint and redirect policy, auth scope, tenant binding, and parameter policy. A document cannot mint any of them.
- **Resource bounds.** Parameter counts and lengths plus canonical row, column, cell, and bounded payload limits are enforced before domain use.
- **Auditable provenance.** Every accepted response has a snapshot ID, opaque source reference, mandatory freshness timestamp, and optional query ID and query digest. Receipts may record these safe identifiers and a canonical snapshot digest, never acquisition secrets or query text.
- **Controlled transport.** Optional network acquisition requires a fixed endpoint, cancellation via `AbortSignal`, a finite timeout, response-byte enforcement while reading, redirects disabled or allowlisted, and an egress audit that records only safe endpoint identity and outcome metadata.
- **Policy before data use.** The host policy validates parameters, freshness tolerance, redaction, tenant scope, and result eligibility. Structural parsing cannot override host policy.

Errors may identify the rejected field or rule but must not interpolate rejected values. Logs and receipts must use safe identifiers and bounded outcome metadata only.

## Non-goals

This contract does not administer databases, create indexes, discover endpoints, execute arbitrary statements, accept credentials, define an upstream DeepSQL API, or permit render-time data fetching. Task 25 is responsible for any response-to-`DataSnapshot` mapping and for proving that an optional adapter remains disabled until explicitly configured and reviewed by the host.
