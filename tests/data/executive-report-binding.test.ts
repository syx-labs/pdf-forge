import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { bindExecutiveReport } from "../../src/data/bindings/executive-report.js";
import { parseDataSnapshot } from "../../src/data/schemas.js";
import { composeDocumentPage } from "../../src/registry/compose.js";
import { parseDocumentManifest } from "../../src/registry/document-manifest.js";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));

function canonicalSnapshot() {
  return parseDataSnapshot({
    schemaVersion: "1",
    snapshotId: "snapshot-executive-report-2026-08-17",
    providerId: "static-json",
    sourceRef: "fixtures/executive-report",
    mode: "read-only",
    capturedAt: "2026-08-17T10:30:00+00:00",
    columns: [
      { name: "ignored", type: "boolean" },
      { name: "target", type: "number" },
      { name: "recommendation", type: "string" },
      { name: "region", type: "string" },
      { name: "revenue", type: "number" },
    ],
    rows: [
      [true, 150.25, "  Protect onboarding capacity.  ", "South", 125.5],
      [false, 250.5, "Expand enterprise coverage.", "North", 225.25],
      [true, 0, "Protect onboarding capacity.", "West", 0],
    ],
  });
}

function snapshotWithData(columns: unknown, rows: unknown) {
  return parseDataSnapshot({
    schemaVersion: "1",
    snapshotId: "snapshot-executive-report-variant",
    providerId: "static-json",
    sourceRef: "fixtures/executive-report-variant",
    mode: "read-only",
    capturedAt: "2026-08-17T10:30:00+00:00",
    columns,
    rows,
  });
}

describe("bindExecutiveReport", () => {
  test("binds exact deterministic props while preserving row and recommendation order", () => {
    const result = bindExecutiveReport(canonicalSnapshot());

    expect(result).toEqual({
      title: "Executive revenue report",
      summary: "3 regions captured at 2026-08-17T10:30:00+00:00.",
      metrics: [
        { label: "Total revenue", value: "350.75" },
        { label: "Total target", value: "400.75" },
      ],
      table: {
        columns: [
          { key: "region", label: "Region", align: "left" },
          { key: "revenue", label: "Revenue", align: "right" },
          { key: "target", label: "Target", align: "right" },
        ],
        rows: [
          { cells: ["South", 125.5, 150.25] },
          { cells: ["North", 225.25, 250.5] },
          { cells: ["West", 0, 0] },
        ],
      },
      recommendations: [
        "Protect onboarding capacity.",
        "Expand enterprise coverage.",
      ],
    });
  });

  test("reports every missing required column in canonical order", () => {
    const snapshot = snapshotWithData(
      [
        { name: "revenue", type: "number" },
        { name: "recommendation", type: "string" },
      ],
      [[10, "Act now."]]
    );

    expect(() => bindExecutiveReport(snapshot)).toThrow(
      'Invalid executive-report snapshot columns: "region" is missing; "target" is missing.'
    );
  });

  test("reports every wrong required column type in canonical order", () => {
    const snapshot = snapshotWithData(
      [
        { name: "region", type: "number" },
        { name: "revenue", type: "string" },
        { name: "target", type: "boolean" },
        { name: "recommendation", type: "null" },
      ],
      [[1, "10", true, null]]
    );

    expect(() => bindExecutiveReport(snapshot)).toThrow(
      'Invalid executive-report snapshot columns: "region" must have type "string" (received "number"); "revenue" must have type "number" (received "string"); "target" must have type "number" (received "boolean"); "recommendation" must have type "string" (received "null").'
    );
  });

  test("requires at least one regional row", () => {
    const snapshot = snapshotWithData(
      [
        { name: "region", type: "string" },
        { name: "revenue", type: "number" },
        { name: "target", type: "number" },
        { name: "recommendation", type: "string" },
      ],
      []
    );

    expect(() => bindExecutiveReport(snapshot)).toThrow(
      "Executive-report binding requires at least one row."
    );
  });

  test("rejects datasets whose recommendations are all blank", () => {
    const snapshot = snapshotWithData(
      [
        { name: "region", type: "string" },
        { name: "revenue", type: "number" },
        { name: "target", type: "number" },
        { name: "recommendation", type: "string" },
      ],
      [
        ["South", 10, 12, "   "],
        ["North", 20, 22, "\t"],
      ]
    );

    expect(() => bindExecutiveReport(snapshot)).toThrow(
      "Executive-report binding requires at least one non-blank recommendation."
    );
  });

  test("fails closed when a finite numeric column overflows during summation", () => {
    const columns = [
      { name: "region", type: "string" },
      { name: "revenue", type: "number" },
      { name: "target", type: "number" },
      { name: "recommendation", type: "string" },
    ];
    const cases = [
      {
        name: "revenue",
        rows: [
          ["South", 1e308, 1, "First."],
          ["North", 1e308, 1, "Second."],
        ],
      },
      {
        name: "target",
        rows: [
          ["South", 1, 1e308, "First."],
          ["North", 1, 1e308, "Second."],
        ],
      },
    ];

    for (const testCase of cases) {
      const snapshot = snapshotWithData(columns, testCase.rows);
      expect(() => bindExecutiveReport(snapshot)).toThrow(
        `Executive-report sum for "${testCase.name}" became non-finite at row 2.`
      );
    }
  });

  test("produces props accepted by the canonical executive-report block composer", async () => {
    const props = bindExecutiveReport(canonicalSnapshot());
    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "bound-executive-report",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "report-page",
          selection: { kind: "block", id: "executive-report" },
          props,
        },
      ],
    });

    const html = await composeDocumentPage(
      manifest,
      manifest.pages[0],
      PACKAGE_ROOT
    );

    expect(html).toContain("Executive revenue report");
    expect(html).toContain("Total revenue");
    expect(html).toContain("South");
    expect(html).toContain("Protect onboarding capacity.");
    expect(html).not.toContain("{{");
    expect(html).not.toContain("data-pdf-forge-slot");
  });

  test("does not mutate the snapshot and returns deterministic deeply frozen props", () => {
    const snapshot = canonicalSnapshot();
    const before = JSON.stringify(snapshot);

    const first = bindExecutiveReport(snapshot);
    const second = bindExecutiveReport(snapshot);

    expect(JSON.stringify(snapshot)).toBe(before);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.table.rows).not.toBe(snapshot.rows);
    for (const value of [
      first,
      first.metrics,
      ...first.metrics,
      first.table,
      first.table.columns,
      ...first.table.columns,
      first.table.rows,
      ...first.table.rows,
      ...first.table.rows.map((row) => row.cells),
      first.recommendations,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Reflect.set(first.metrics[0], "value", "0.00")).toBe(false);
    expect(Reflect.set(first.table.rows[0].cells, 0, "Changed")).toBe(false);
    expect(Reflect.set(first.recommendations, 0, "Changed")).toBe(false);
    expect(first.metrics[0].value).toBe("350.75");
    expect(first.table.rows[0].cells[0]).toBe("South");
    expect(first.recommendations[0]).toBe("Protect onboarding capacity.");
  });
});
