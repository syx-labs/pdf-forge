import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import {
  createDataSnapshotSchema,
  DataSnapshotSchema,
  parseDataSnapshot,
} from "../../src/data/schemas";
import {
  DEFAULT_DATA_LIMITS,
  resolveDataLimits,
} from "../../src/data/limits";

const validSnapshot = {
  schemaVersion: "1",
  snapshotId: "snapshot-2026-08-17",
  providerId: "static-json",
  sourceRef: "reports/monthly-2026-08",
  mode: "read-only",
  capturedAt: "2026-08-17T10:30:00+00:00",
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
    { name: "active", type: "boolean" },
    { name: "note", type: "null" },
  ],
  rows: [["south", 1250.5, true, null]],
};

describe("parseDataSnapshot", () => {
  test("parses a versioned read-only snapshot preserving data order", () => {
    const parsed = parseDataSnapshot(validSnapshot);

    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.mode).toBe("read-only");
    expect(parsed.columns.map((column) => column.name)).toEqual([
      "region",
      "revenue",
      "active",
      "note",
    ]);
    expect(parsed.rows[0]).toEqual(["south", 1250.5, true, null]);
  });

  test("rejects duplicate column names", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        columns: [
          { name: "region", type: "string" },
          { name: "region", type: "number" },
        ],
        rows: [["south", 1250.5]],
      })
    ).toThrow();
  });

  test("rejects rows whose width differs from the column count", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        rows: [["south", 1250.5]],
      })
    ).toThrow();
  });

  test("exposes explicit immutable default limits", () => {
    expect(DEFAULT_DATA_LIMITS).toEqual({
      maxRows: 10_000,
      maxColumns: 100,
      maxEncodedBytes: 5_242_880,
    });
    expect(Object.isFrozen(DEFAULT_DATA_LIMITS)).toBe(true);
  });

  test("merges validated host overrides into frozen limits", () => {
    const limits = resolveDataLimits({ maxRows: 1 });

    expect(limits).toEqual({
      ...DEFAULT_DATA_LIMITS,
      maxRows: 1,
    });
    expect(Object.isFrozen(limits)).toBe(true);
    expect(() =>
      resolveDataLimits({ maxRows: 1, documentControlled: true })
    ).toThrow();
    for (const maxRows of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => resolveDataLimits({ maxRows })).toThrow();
    }
  });

  test("enforces a host maxRows override", () => {
    const rows = [validSnapshot.rows[0], validSnapshot.rows[0]];

    expect(() =>
      parseDataSnapshot({ ...validSnapshot, rows }, { maxRows: 1 })
    ).toThrow();
  });

  test("enforces a host maxColumns override through the schema factory", () => {
    const schema = createDataSnapshotSchema({ maxColumns: 1 });

    expect(() => schema.parse(validSnapshot)).toThrow();
  });

  test("enforces maxEncodedBytes against serialized UTF-8 bytes", () => {
    const snapshot = {
      ...validSnapshot,
      rows: [["sul-é", 1250.5, true, null]],
    };
    const json = JSON.stringify(snapshot);
    const utf8Bytes = Buffer.byteLength(json, "utf8");

    expect(utf8Bytes).toBeGreaterThan(json.length);
    expect(() =>
      parseDataSnapshot(snapshot, { maxEncodedBytes: utf8Bytes - 1 })
    ).toThrow();
    expect(() =>
      parseDataSnapshot(snapshot, { maxEncodedBytes: utf8Bytes })
    ).not.toThrow();
  });

  test("does not accept limits embedded in the snapshot payload", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        limits: { maxRows: 100_000 },
      })
    ).toThrow();
  });

  test("rejects unsafe snapshot identifiers", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        snapshotId: "snapshot/../../secrets",
      })
    ).toThrow();
  });

  test("rejects unsafe provider identifiers", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        providerId: "provider?token=secret",
      })
    ).toThrow();
  });

  test("rejects source references carrying SQL or credential payloads", () => {
    for (const sourceRef of [
      "SELECT * FROM customers",
      "postgres://user:secret@db.internal/reports",
      "password:secret-value",
      "query-id?api_key=secret",
    ]) {
      expect(() =>
        parseDataSnapshot({ ...validSnapshot, sourceRef })
      ).toThrow();
    }
  });

  test("rejects unsafe column names", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        columns: [
          { name: "region; DROP TABLE reports", type: "string" },
          ...validSnapshot.columns.slice(1),
        ],
      })
    ).toThrow();
  });

  test("exports the default DataSnapshot schema", () => {
    expect(DataSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  test("rejects unsupported snapshot versions", () => {
    expect(() =>
      parseDataSnapshot({ ...validSnapshot, schemaVersion: "2" })
    ).toThrow();
  });

  test("rejects unknown fields inside column objects", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        columns: [
          { ...validSnapshot.columns[0], databaseType: "varchar" },
          ...validSnapshot.columns.slice(1),
        ],
      })
    ).toThrow();
  });

  test("rejects unsupported column scalar types", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        columns: [
          { name: "region", type: "date" },
          ...validSnapshot.columns.slice(1),
        ],
      })
    ).toThrow();
  });

  test("rejects values that do not match their declared column type", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        rows: [[1250.5, "south", true, null]],
      })
    ).toThrow();
  });

  test("rejects non-scalar row cells", () => {
    for (const cell of [{ nested: true }, ["nested"], undefined]) {
      expect(() =>
        parseDataSnapshot({
          ...validSnapshot,
          rows: [[cell, 1250.5, true, null]],
        })
      ).toThrow();
    }
  });

  test("rejects non-finite numeric cells", () => {
    for (const cell of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      expect(() =>
        parseDataSnapshot({
          ...validSnapshot,
          rows: [["south", cell, true, null]],
        })
      ).toThrow();
    }
  });

  test("requires a captured timestamp", () => {
    const snapshot = { ...validSnapshot };
    Reflect.deleteProperty(snapshot, "capturedAt");

    expect(() => parseDataSnapshot(snapshot)).toThrow();
  });

  test("requires an ISO datetime with timezone information", () => {
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        capturedAt: "2026-08-17T10:30:00",
      })
    ).toThrow();
    expect(() =>
      parseDataSnapshot({
        ...validSnapshot,
        capturedAt: "2026-08-17T10:30:00-03:00",
      })
    ).not.toThrow();
  });

  test("rejects any mode other than read-only", () => {
    expect(() =>
      parseDataSnapshot({ ...validSnapshot, mode: "read-write" })
    ).toThrow();
  });

  test("returns a deeply frozen serializable snapshot", () => {
    const parsed = parseDataSnapshot(validSnapshot);

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.columns)).toBe(true);
    expect(Object.isFrozen(parsed.columns[0])).toBe(true);
    expect(Object.isFrozen(parsed.rows)).toBe(true);
    expect(Object.isFrozen(parsed.rows[0])).toBe(true);
  });
});
