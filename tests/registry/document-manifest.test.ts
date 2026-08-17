import { describe, expect, test } from "bun:test";
import { parseDocumentManifest } from "../../src/registry/document-manifest";

const validManifest = {
  schemaVersion: "1",
  documentId: "quarterly-report",
  format: "slides",
  theme: "ivory-editorial",
  pages: [
    {
      id: "executive-summary",
      selection: { kind: "primitive", id: "metric-card" },
      props: {
        label: "Net revenue",
        value: "$1.2M",
        trend: { direction: "up", amount: 12 },
      },
    },
  ],
  snapshotRef: "snapshot-2026-q2",
} as const;

describe("parseDocumentManifest", () => {
  test("parses a valid versioned composition manifest", () => {
    const manifest = parseDocumentManifest(validManifest);

    expect(manifest).toEqual(validManifest);
  });

  test("accepts only slides and docs composition formats", () => {
    expect(() =>
      parseDocumentManifest({ ...validManifest, format: "social" })
    ).toThrow();
    expect(() =>
      parseDocumentManifest({ ...validManifest, format: "poster" })
    ).toThrow();
    expect(
      parseDocumentManifest({ ...validManifest, format: "docs" }).format
    ).toBe("docs");
  });

  test("requires an explicit primitive or block selection", () => {
    expect(() =>
      parseDocumentManifest({
        ...validManifest,
        pages: [
          {
            ...validManifest.pages[0],
            selection: { kind: "widget", id: "metric-card" },
          },
        ],
      })
    ).toThrow();
    expect(
      parseDocumentManifest({
        ...validManifest,
        pages: [
          {
            ...validManifest.pages[0],
            selection: { kind: "block", id: "executive-report" },
          },
        ],
      }).pages[0].selection.kind
    ).toBe("block");
  });

  test("rejects unsafe page IDs", () => {
    const unsafeIds = ["", "../cover", "page/one", "page one", "page.one"];

    for (const id of unsafeIds) {
      expect(() =>
        parseDocumentManifest({
          ...validManifest,
          pages: [{ ...validManifest.pages[0], id }],
        })
      ).toThrow();
    }
  });

  test("rejects unsafe registry selection IDs", () => {
    const unsafeIds = [
      "",
      "../metric-card",
      "blocks/report",
      "blocks\\report",
      "metric card",
      "metric-card;DROP TABLE users",
    ];

    for (const id of unsafeIds) {
      expect(() =>
        parseDocumentManifest({
          ...validManifest,
          pages: [
            {
              ...validManifest.pages[0],
              selection: { kind: "primitive", id },
            },
          ],
        })
      ).toThrow();
    }
  });

  test("rejects duplicate page IDs", () => {
    expect(() =>
      parseDocumentManifest({
        ...validManifest,
        pages: [validManifest.pages[0], validManifest.pages[0]],
      })
    ).toThrow();
  });

  test("requires an explicit safe theme ID", () => {
    const unsafeThemes = ["", "   ", "../ivory-editorial", "ivory editorial"];

    for (const theme of unsafeThemes) {
      expect(() =>
        parseDocumentManifest({ ...validManifest, theme })
      ).toThrow();
    }
    expect(() => {
      const { theme: _theme, ...withoutTheme } = validManifest;
      return parseDocumentManifest(withoutTheme);
    }).toThrow();
  });

  test("rejects an empty page list", () => {
    expect(() =>
      parseDocumentManifest({ ...validManifest, pages: [] })
    ).toThrow();
  });

  test("rejects unknown fields at every structured level", () => {
    expect(() =>
      parseDocumentManifest({ ...validManifest, credentials: "secret" })
    ).toThrow();
    expect(() =>
      parseDocumentManifest({
        ...validManifest,
        pages: [{ ...validManifest.pages[0], sql: "SELECT * FROM users" }],
      })
    ).toThrow();
    expect(() =>
      parseDocumentManifest({
        ...validManifest,
        pages: [
          {
            ...validManifest.pages[0],
            selection: {
              ...validManifest.pages[0].selection,
              path: "../../template.html",
            },
          },
        ],
      })
    ).toThrow();
  });

  test("preserves props for entry-schema validation and freezes the result deeply", () => {
    const manifest = parseDocumentManifest(validManifest);

    expect(manifest.pages[0].props).toEqual(validManifest.pages[0].props);
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.pages)).toBe(true);
    expect(Object.isFrozen(manifest.pages[0])).toBe(true);
    expect(Object.isFrozen(manifest.pages[0].selection)).toBe(true);
    expect(Object.isFrozen(manifest.pages[0].props)).toBe(true);
    const props = manifest.pages[0].props;
    if (typeof props !== "object" || props === null) {
      throw new Error("Expected object props in the valid manifest fixture.");
    }
    expect(Object.isFrozen(Reflect.get(props, "trend"))).toBe(true);
  });

  test("accepts only safe opaque snapshot references", () => {
    expect(parseDocumentManifest(validManifest).snapshotRef).toBe(
      "snapshot-2026-q2"
    );
    for (const snapshotRef of [
      "../snapshot",
      "SELECT * FROM snapshots",
      "snapshot ref",
      "postgres://database",
      "",
    ]) {
      expect(() =>
        parseDocumentManifest({ ...validManifest, snapshotRef })
      ).toThrow();
    }
  });

  test("requires safe document IDs", () => {
    for (const documentId of ["", "../report", "report one", "report.pdf"]) {
      expect(() =>
        parseDocumentManifest({ ...validManifest, documentId })
      ).toThrow();
    }
  });
});
