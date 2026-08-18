import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  canonicalizeDataSnapshot,
  hashDataSnapshot,
} from "../../src/data/canonicalize.js";
import type { DataSnapshot } from "../../src/data/types.js";

function snapshotInSchemaOrder(): DataSnapshot {
  return {
    schemaVersion: "1",
    snapshotId: "snapshot-2026-08-17",
    providerId: "static-json",
    sourceRef: "reports/monthly-2026-08",
    mode: "read-only",
    capturedAt: "2026-08-17T10:30:00+00:00",
    columns: [
      { name: "region", type: "string" },
      { name: "revenue", type: "number" },
    ],
    rows: [
      ["south", 1250.5],
      ["north", 980],
    ],
  };
}

function snapshotInReverseInsertionOrder(): DataSnapshot {
  return {
    rows: [
      ["south", 1250.5],
      ["north", 980],
    ],
    columns: [
      { type: "string", name: "region" },
      { type: "number", name: "revenue" },
    ],
    capturedAt: "2026-08-17T10:30:00+00:00",
    mode: "read-only",
    sourceRef: "reports/monthly-2026-08",
    providerId: "static-json",
    snapshotId: "snapshot-2026-08-17",
    schemaVersion: "1",
  };
}

describe("canonicalizeDataSnapshot", () => {
  test("sorts object keys recursively without changing material sequence data or input", () => {
    const snapshot = snapshotInSchemaOrder();
    const differentlyOrderedSnapshot = snapshotInReverseInsertionOrder();
    const before = JSON.stringify(snapshot);

    const canonical = canonicalizeDataSnapshot(snapshot);

    expect(canonical).toBe(
      '{"capturedAt":"2026-08-17T10:30:00+00:00","columns":[{"name":"region","type":"string"},{"name":"revenue","type":"number"}],"mode":"read-only","providerId":"static-json","rows":[["south",1250.5],["north",980]],"schemaVersion":"1","snapshotId":"snapshot-2026-08-17","sourceRef":"reports/monthly-2026-08"}'
    );
    expect(canonicalizeDataSnapshot(differentlyOrderedSnapshot)).toBe(
      canonical
    );
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  test("rejects non-finite numbers and unsupported runtime values defensively", () => {
    for (const nonFinite of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      const snapshot = snapshotInSchemaOrder();
      Reflect.set(snapshot.rows[0], 1, nonFinite);

      expect(() => canonicalizeDataSnapshot(snapshot)).toThrow(TypeError);
    }

    for (const unsupported of [
      undefined,
      Symbol("unsupported"),
      1n,
      () => "unsupported",
    ]) {
      const snapshot = snapshotInSchemaOrder();
      Reflect.set(snapshot.rows[0], 0, unsupported);

      expect(() => canonicalizeDataSnapshot(snapshot)).toThrow(TypeError);
    }
  });
});

describe("hashDataSnapshot", () => {
  test("uses SHA-256 over canonical UTF-8 bytes for every material snapshot field", () => {
    const snapshot = snapshotInSchemaOrder();
    const canonical = canonicalizeDataSnapshot(snapshot);
    const independentlyComputedSha256 = createHash("sha256")
      .update(canonical, "utf8")
      .digest("hex");
    const digest = hashDataSnapshot(snapshot);

    expect(independentlyComputedSha256).toBe(
      "bb5fcceaa70926f3d107491eaf7caf9785295c4238864eeea8f177d8285865b9"
    );
    expect(digest).toBe(independentlyComputedSha256);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe(
      createHash("sha1").update(canonical, "utf8").digest("hex")
    );
    expect(digest).not.toBe(
      createHash("md5").update(canonical, "utf8").digest("hex")
    );
    expect(hashDataSnapshot(snapshotInReverseInsertionOrder())).toBe(digest);
    expect(
      hashDataSnapshot({
        ...snapshot,
        rows: [
          ["north", 980],
          ["south", 1250.5],
        ],
      })
    ).not.toBe(digest);
    expect(
      hashDataSnapshot({
        ...snapshot,
        capturedAt: "2026-08-17T10:30:01+00:00",
      })
    ).not.toBe(digest);
  });
});
