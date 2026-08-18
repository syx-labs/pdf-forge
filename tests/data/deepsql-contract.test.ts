import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { DEFAULT_DATA_LIMITS } from "../../src/data/limits.js";
import {
  parseDeepSqlRequest,
  parseDeepSqlResponse,
} from "../../src/data/providers/deepsql-contract.js";

const DOCS_PATH = resolve(
  import.meta.dir,
  "../../docs/integrations/deepsql.md"
);

const validRequest = {
  schemaVersion: "1",
  operation: "query",
  mode: "read-only",
  queryId: "monthly-revenue",
};

const validResponse = {
  schemaVersion: "1",
  mode: "read-only",
  snapshotId: "snapshot-2026-08-17",
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
    { name: "active", type: "boolean" },
    { name: "note", type: "null" },
  ],
  rows: [["south", 1250.5, true, null]],
  provenance: {
    sourceRef: "deepsql/reports/monthly-revenue",
    freshnessAt: "2026-08-17T10:30:00+00:00",
    queryId: "monthly-revenue",
  },
};

function rejectionMessage(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
  throw new Error("Expected parser to reject input.");
}

describe("DeepSQL request contract", () => {
  test("parses the minimum versioned read-only query request", () => {
    expect(parseDeepSqlRequest(validRequest)).toEqual(validRequest);
  });

  test("accepts bounded scalar parameters", () => {
    const request = {
      ...validRequest,
      parameters: {
        region: "south",
        month: 8,
        active: true,
        owner: null,
      },
    };

    expect(parseDeepSqlRequest(request)).toEqual(request);
  });

  test("rejects mutating and unsupported operations", () => {
    for (const operation of ["mutation", "execute", "update", "delete"]) {
      expect(() => parseDeepSqlRequest({ ...validRequest, operation })).toThrow();
    }
    expect(() =>
      parseDeepSqlRequest({ ...validRequest, mode: "read-write" })
    ).toThrow();
  });

  test("rejects raw SQL and secret-bearing request fields without echoing values", () => {
    const sensitiveValue = "sensitive-value-must-not-be-echoed";
    for (const field of [
      "sql",
      "query",
      "token",
      "apiKey",
      "connectionString",
      "credentials",
      "auth",
    ]) {
      const message = rejectionMessage(() =>
        parseDeepSqlRequest({ ...validRequest, [field]: sensitiveValue })
      );
      expect(message).not.toContain(sensitiveValue);
    }
  });

  test("treats bounded parameter strings as inert data for host policy to validate", () => {
    for (const value of [
      "SELECT cohort FROM segment",
      "token=business-label",
      "Bearer product-name",
    ]) {
      expect(
        parseDeepSqlRequest({
          ...validRequest,
          parameters: { filter: value },
        })
      ).toMatchObject({ parameters: { filter: value } });
    }
  });

  test("rejects nested, non-finite, unsafe, oversize, and excessive parameters", () => {
    const excessiveParameters = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`param-${index}`, index])
    );
    const invalidParameters: unknown[] = [
      { nested: { value: true } },
      { nested: ["value"] },
      { nonFinite: Number.NaN },
      { nonFinite: Number.POSITIVE_INFINITY },
      { "unsafe parameter": "value" },
      { ["p".repeat(129)]: "value" },
      { token: "not-a-request-parameter" },
      { rawSql: "not-a-request-parameter" },
      { tooLong: "x".repeat(4097) },
      excessiveParameters,
    ];

    for (const parameters of invalidParameters) {
      expect(() =>
        parseDeepSqlRequest({ ...validRequest, parameters })
      ).toThrow();
    }
  });

  test("does not mutate input and returns a deeply frozen serializable request", () => {
    const input = {
      ...validRequest,
      parameters: { region: "south", month: 8 },
    };
    const before = structuredClone(input);

    const parsed = parseDeepSqlRequest(input);

    expect(input).toEqual(before);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.parameters)).toBe(true);
  });
});

describe("DeepSQL response contract", () => {
  test("parses rows, columns, and mandatory provenance", () => {
    expect(parseDeepSqlResponse(validResponse)).toEqual(validResponse);
  });

  test("accepts optional lowercase SHA-256 digest metadata", () => {
    const response = {
      ...validResponse,
      provenance: {
        ...validResponse.provenance,
        queryDigest: "a".repeat(64),
      },
    };

    expect(parseDeepSqlResponse(response)).toEqual(response);
  });

  test("requires query identity in provenance", () => {
    const provenance = { ...validResponse.provenance };
    Reflect.deleteProperty(provenance, "queryId");
    expect(() => parseDeepSqlResponse({ ...validResponse, provenance })).toThrow();
  });

  test("requires freshness with explicit timezone information", () => {
    const missingFreshness = { ...validResponse.provenance };
    Reflect.deleteProperty(missingFreshness, "freshnessAt");

    expect(() =>
      parseDeepSqlResponse({
        ...validResponse,
        provenance: missingFreshness,
      })
    ).toThrow();
    expect(() =>
      parseDeepSqlResponse({
        ...validResponse,
        provenance: {
          ...validResponse.provenance,
          freshnessAt: "2026-08-17T10:30:00",
        },
      })
    ).toThrow();
  });

  test("rejects invalid or uppercase query digests", () => {
    for (const queryDigest of ["a".repeat(63), "A".repeat(64), "g".repeat(64)]) {
      expect(() =>
        parseDeepSqlResponse({
          ...validResponse,
          provenance: { ...validResponse.provenance, queryDigest },
        })
      ).toThrow();
    }
  });

  test("strictly rejects credential and raw-query fields at response boundaries", () => {
    const sensitiveValue = "response-secret-must-not-be-echoed";
    const invalidResponses = [
      { ...validResponse, token: sensitiveValue },
      { ...validResponse, apiKey: sensitiveValue },
      { ...validResponse, connectionString: sensitiveValue },
      { ...validResponse, credentials: sensitiveValue },
      { ...validResponse, sql: sensitiveValue },
      { ...validResponse, query: sensitiveValue },
      {
        ...validResponse,
        provenance: { ...validResponse.provenance, token: sensitiveValue },
      },
      {
        ...validResponse,
        provenance: { ...validResponse.provenance, sql: sensitiveValue },
      },
      {
        ...validResponse,
        columns: [
          { ...validResponse.columns[0], apiKey: sensitiveValue },
          ...validResponse.columns.slice(1),
        ],
      },
    ];

    for (const response of invalidResponses) {
      const message = rejectionMessage(() => parseDeepSqlResponse(response));
      expect(message).not.toContain(sensitiveValue);
    }
  });

  test("rejects credential and raw-query column names", () => {
    for (const name of [
      "token",
      "apiKey",
      "connectionString",
      "credentials",
      "sql",
      "rawSql",
      "query",
    ]) {
      expect(() =>
        parseDeepSqlResponse({
          ...validResponse,
          columns: [{ name, type: "string" }],
          rows: [["sensitive"]],
        })
      ).toThrow();
    }
  });

  test("treats bounded response strings as inert report data", () => {
    for (const value of [
      "SELECT cohort FROM segment",
      "token=business-label",
      "Bearer product-name",
    ]) {
      expect(
        parseDeepSqlResponse({
          ...validResponse,
          columns: [{ name: "value", type: "string" }],
          rows: [[value]],
        })
      ).toMatchObject({ rows: [[value]] });
    }
  });

  test("rejects source references carrying SQL or credential payloads", () => {
    for (const sourceRef of [
      "SELECT * FROM customers",
      "postgres://user:secret@db.internal/reports",
      "password/secret-value",
      "token/secret-value",
      "reports/drop-table-customers",
    ]) {
      expect(() =>
        parseDeepSqlResponse({
          ...validResponse,
          provenance: { ...validResponse.provenance, sourceRef },
        })
      ).toThrow();
    }
  });

  test("rejects duplicate columns", () => {
    expect(() =>
      parseDeepSqlResponse({
        ...validResponse,
        columns: [
          { name: "region", type: "string" },
          { name: "region", type: "string" },
        ],
        rows: [["south", "duplicate"]],
      })
    ).toThrow();
  });

  test("rejects row width and declared cell type mismatches", () => {
    expect(() =>
      parseDeepSqlResponse({ ...validResponse, rows: [["south", 1250.5]] })
    ).toThrow();
    expect(() =>
      parseDeepSqlResponse({
        ...validResponse,
        rows: [[1250.5, "south", true, null]],
      })
    ).toThrow();
  });

  test("rejects nested and non-finite cells", () => {
    for (const cell of [
      { nested: true },
      ["nested"],
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(() =>
        parseDeepSqlResponse({
          ...validResponse,
          rows: [["south", cell, true, null]],
        })
      ).toThrow();
    }
  });

  test("enforces canonical row and column count limits", () => {
    const excessiveRows = Array.from(
      { length: DEFAULT_DATA_LIMITS.maxRows + 1 },
      () => validResponse.rows[0]
    );
    const excessiveColumns = Array.from(
      { length: DEFAULT_DATA_LIMITS.maxColumns + 1 },
      (_, index) => ({ name: `column-${index}`, type: "string" })
    );

    expect(() =>
      parseDeepSqlResponse({ ...validResponse, rows: excessiveRows })
    ).toThrow();
    expect(() =>
      parseDeepSqlResponse({
        ...validResponse,
        columns: excessiveColumns,
        rows: [excessiveColumns.map(() => "value")],
      })
    ).toThrow();
  });

  test("enforces the canonical serialized UTF-8 payload limit", () => {
    const oversizeResponse = {
      ...validResponse,
      columns: [{ name: "value", type: "string" }],
      rows: [["x".repeat(DEFAULT_DATA_LIMITS.maxEncodedBytes)]],
    };

    expect(() => parseDeepSqlResponse(oversizeResponse)).toThrow();
  });

  test("does not mutate input and returns a deeply frozen serializable response", () => {
    const input = structuredClone(validResponse);
    const before = structuredClone(input);

    const parsed = parseDeepSqlResponse(input);

    expect(input).toEqual(before);
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.columns)).toBe(true);
    expect(Object.isFrozen(parsed.columns[0])).toBe(true);
    expect(Object.isFrozen(parsed.rows)).toBe(true);
    expect(Object.isFrozen(parsed.rows[0])).toBe(true);
    expect(Object.isFrozen(parsed.provenance)).toBe(true);
  });
});

test("DeepSQL integration documentation records both modes and security invariants", async () => {
  const docs = await readFile(DOCS_PATH, "utf8");

  for (const requiredText of [
    "Mode 1 — Host-fetched snapshot (recommended)",
    "Mode 2 — Optional fixed-endpoint adapter",
    "allowlisted query IDs",
    "No raw SQL",
    "No credentials in documents, responses, receipts, or logs",
    "Read-only only",
    "bounded payload",
    "freshness",
    "query digest",
    "provenance",
    "AbortSignal",
    "timeout",
    "egress audit",
    "host policy validates parameters",
    "disabled by default",
  ]) {
    expect(docs).toContain(requiredText);
  }
});
