import { describe, expect, test } from "bun:test";
import {
  canonicalizeDataSnapshot,
  hashDataSnapshot,
} from "../../src/data/canonicalize.js";
import { redactDataSnapshot } from "../../src/data/redact.js";
import { parseDataSnapshot } from "../../src/data/schemas.js";

const DEFAULT_REPLACEMENT = "[REDACTED]";

function snapshotFixture() {
  return parseDataSnapshot({
    schemaVersion: "1",
    snapshotId: "snapshot-redaction-2026-08-17",
    providerId: "static-json",
    sourceRef: "fixtures/redaction-report",
    mode: "read-only",
    capturedAt: "2026-08-17T10:30:00+00:00",
    columns: [
      { name: "region", type: "string" },
      { name: "email", type: "string" },
      { name: "Email", type: "string" },
      { name: "token", type: "string" },
      { name: "score", type: "number" },
      { name: "empty", type: "null" },
    ],
    rows: [
      [
        "south",
        "south@example.private",
        "South@example.private",
        "token-south-original",
        42,
        null,
      ],
      [
        "north",
        "north@example.private",
        "North@example.private",
        "token-north-original",
        7,
        null,
      ],
    ],
  });
}

function expectDeeplyFrozenSnapshot(
  snapshot: ReturnType<typeof snapshotFixture>
): void {
  expect(Object.isFrozen(snapshot)).toBe(true);
  expect(Object.isFrozen(snapshot.columns)).toBe(true);
  expect(Object.isFrozen(snapshot.columns[0])).toBe(true);
  expect(Object.isFrozen(snapshot.rows)).toBe(true);
  expect(Object.isFrozen(snapshot.rows[0])).toBe(true);
}

describe("redactDataSnapshot", () => {
  test("deny redacts only exact case-sensitive column names with the default marker", () => {
    const snapshot = snapshotFixture();

    const redacted = redactDataSnapshot(snapshot, {
      mode: "deny",
      columns: ["email"],
    });

    expect(redacted).toEqual({
      ...snapshot,
      columns: [
        { name: "region", type: "string" },
        { name: "email", type: "string" },
        { name: "Email", type: "string" },
        { name: "token", type: "string" },
        { name: "score", type: "number" },
        { name: "empty", type: "null" },
      ],
      rows: [
        [
          "south",
          DEFAULT_REPLACEMENT,
          "South@example.private",
          "token-south-original",
          42,
          null,
        ],
        [
          "north",
          DEFAULT_REPLACEMENT,
          "North@example.private",
          "token-north-original",
          7,
          null,
        ],
      ],
    });
    expect(redacted.columns.map((column) => column.name)).toEqual(
      snapshot.columns.map((column) => column.name)
    );
    expect(redacted.rows.map((row) => row.length)).toEqual([6, 6]);
  });

  test("allow preserves only listed columns and supports a custom marker", () => {
    const snapshot = snapshotFixture();

    const redacted = redactDataSnapshot(snapshot, {
      mode: "allow",
      columns: ["region", "score"],
      replacement: "<MASKED>",
    });

    expect(redacted.columns).toEqual([
      { name: "region", type: "string" },
      { name: "email", type: "string" },
      { name: "Email", type: "string" },
      { name: "token", type: "string" },
      { name: "score", type: "number" },
      { name: "empty", type: "string" },
    ]);
    expect(redacted.rows).toEqual([
      ["south", "<MASKED>", "<MASKED>", "<MASKED>", 42, "<MASKED>"],
      ["north", "<MASKED>", "<MASKED>", "<MASKED>", 7, "<MASKED>"],
    ]);
  });

  test("fails actionably when an exact policy column is absent", () => {
    const snapshot = snapshotFixture();

    for (const mode of ["deny", "allow"] as const) {
      expect(() =>
        redactDataSnapshot(snapshot, { mode, columns: ["EMAIL"] })
      ).toThrow(
        'Redaction policy column "EMAIL" does not exist in the snapshot.'
      );
    }
  });

  test("rejects duplicate and unsafe policy column names", () => {
    const snapshot = snapshotFixture();

    expect(() =>
      redactDataSnapshot(snapshot, {
        mode: "deny",
        columns: ["email", "email"],
      })
    ).toThrow("Duplicate redaction policy column: email");
    for (const unsafeName of ["", "email;DROP", "a".repeat(129)]) {
      expect(() =>
        redactDataSnapshot(snapshot, {
          mode: "deny",
          columns: [unsafeName],
        })
      ).toThrow();
    }
    expect(() =>
      redactDataSnapshot(snapshot, {
        mode: "deny",
        columns: ["email", "Email"],
      })
    ).not.toThrow();
  });

  test("enforces a strict discriminated policy and a bounded non-empty marker", () => {
    const snapshot = snapshotFixture();

    for (const invalidPolicy of [
      { mode: "mask", columns: ["email"] },
      { mode: "deny", columns: ["email"], inferredPii: true },
      { mode: "deny", columns: "email" },
      { mode: "deny", columns: ["email"], replacement: "" },
      { mode: "deny", columns: ["email"], replacement: "   " },
      { mode: "deny", columns: ["email"], replacement: "x".repeat(257) },
    ]) {
      expect(() => redactDataSnapshot(snapshot, invalidPolicy)).toThrow();
    }
    expect(() =>
      redactDataSnapshot(snapshot, {
        mode: "deny",
        columns: ["email"],
        replacement: "x".repeat(256),
      })
    ).not.toThrow();
  });

  test("redacts numeric and null cells into a schema-valid string column", () => {
    const snapshot = snapshotFixture();

    const redacted = redactDataSnapshot(snapshot, {
      mode: "deny",
      columns: ["score", "empty"],
    });

    expect(redacted.columns[4]).toEqual({ name: "score", type: "string" });
    expect(redacted.columns[5]).toEqual({ name: "empty", type: "string" });
    expect(redacted.rows.map((row) => row.slice(4))).toEqual([
      [DEFAULT_REPLACEMENT, DEFAULT_REPLACEMENT],
      [DEFAULT_REPLACEMENT, DEFAULT_REPLACEMENT],
    ]);
    expect(() => parseDataSnapshot(redacted)).not.toThrow();
  });

  test("does not mutate the input and returns a distinct deeply frozen snapshot", () => {
    const snapshot = snapshotFixture();
    const before = JSON.stringify(snapshot);

    const redacted = redactDataSnapshot(snapshot, {
      mode: "deny",
      columns: ["token"],
    });

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(redacted).not.toBe(snapshot);
    expect(redacted.columns).not.toBe(snapshot.columns);
    expect(redacted.rows).not.toBe(snapshot.rows);
    expectDeeplyFrozenSnapshot(snapshot);
    expectDeeplyFrozenSnapshot(redacted);
    expect(Reflect.set(redacted.rows[0], 3, "restored-secret")).toBe(false);
    expect(redacted.rows[0][3]).toBe(DEFAULT_REPLACEMENT);
  });

  test("does not infer PII without an explicit policy column", () => {
    const snapshot = snapshotFixture();

    const redacted = redactDataSnapshot(snapshot, {
      mode: "deny",
      columns: [],
    });

    expect(redacted).toEqual(snapshot);
    expect(redacted.rows[0][1]).toBe("south@example.private");
    expect(redacted.rows[0][3]).toBe("token-south-original");
  });

  test("excludes redacted originals from output-only serialization, canonical data, block props and receipts", () => {
    const snapshot = snapshotFixture();
    const originals = [
      "south@example.private",
      "north@example.private",
      "token-south-original",
      "token-north-original",
    ];
    const policy = { mode: "deny", columns: ["email", "token"] };

    const first = redactDataSnapshot(snapshot, policy);
    const second = redactDataSnapshot(snapshot, policy);
    const serializedOutput = JSON.stringify(first);
    const canonical = canonicalizeDataSnapshot(first);
    const blockProps = JSON.stringify({
      columns: first.columns,
      rows: first.rows,
    });
    const receipt = JSON.stringify({
      snapshot: first,
      snapshotSha256: hashDataSnapshot(first),
    });

    expect(first).toEqual(second);
    expect(canonicalizeDataSnapshot(second)).toBe(canonical);
    expect(hashDataSnapshot(second)).toBe(hashDataSnapshot(first));
    for (const material of [
      serializedOutput,
      canonical,
      blockProps,
      receipt,
    ]) {
      for (const original of originals) {
        expect(material).not.toContain(original);
      }
    }
  });
});
