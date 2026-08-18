import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { canonicalizeDataSnapshot } from "../../src/data/canonicalize";
import { composeDocumentPageWithMetadata } from "../../src/registry/compose";
import { parseDocumentManifest } from "../../src/registry/document-manifest";
import { loadRegistry } from "../../src/registry/loader";
import { buildPdfBuildReceipt } from "../../src/registry/receipt";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

const temporaryRoots: string[] = [];

const manifest = {
  schemaVersion: "1",
  documentId: "quarterly-report",
  format: "docs",
  theme: "ivory-editorial",
  pages: [
    {
      id: "executive-summary",
      selection: { kind: "block", id: "executive-report" },
      props: { title: "Quarterly report" },
    },
  ],
  snapshotRef: "snapshot-2026-q3",
} as const;

const registry = {
  version: "1",
  entries: [
    {
      kind: "primitive",
      id: "metric-card",
      version: "1.0.0",
      template: "primitives/metric-card/template.html",
      schema: "primitives/metric-card/schema.json",
      formats: ["slides", "docs"],
      themes: ["ivory-editorial"],
    },
    {
      kind: "block",
      id: "executive-report",
      version: "1.0.0",
      template: "blocks/executive-report/template.html",
      schema: "blocks/executive-report/block.yaml",
      formats: ["slides", "docs"],
      themes: ["ivory-editorial"],
    },
  ],
} as const;

const snapshot = {
  schemaVersion: "1",
  snapshotId: "snapshot-2026-q3",
  providerId: "static-json",
  sourceRef: "reports/quarterly-2026-q3",
  mode: "read-only",
  capturedAt: "2026-08-17T10:30:00+00:00",
  columns: [
    { name: "region", type: "string" },
    { name: "private_note", type: "string" },
  ],
  rows: [["south", "classified-cell"]],
} as const;

function receiptInput(pdfPath: string) {
  return {
    manifest,
    registry,
    componentIds: ["metric-card", "executive-report", "metric-card"],
    snapshot,
    mergeResult: {
      path: pdfPath,
      pageCount: 999,
      fileSize: "1 B",
    },
    warnings: ["  beta warning  ", "alpha warning", "alpha warning"],
    createdAt: "2026-08-17T11:45:00+00:00",
  };
}

async function createPdfFixture(pageCount = 2): Promise<{
  path: string;
  bytes: Uint8Array;
}> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-receipt-"));
  temporaryRoots.push(root);
  const path = join(root, "quarterly-report.pdf");
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdf.addPage([595, 842]);
  }
  const bytes = await pdf.save({ addDefaultPage: false });
  await writeFile(path, bytes);
  return { path, bytes };
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("buildPdfBuildReceipt", () => {
  test("builds a serializable frozen receipt from independently verified PDF bytes", async () => {
    const fixture = await createPdfFixture();
    const receipt = await buildPdfBuildReceipt(receiptInput(fixture.path));
    const expectedPdfSha256 = createHash("sha256")
      .update(fixture.bytes)
      .digest("hex");
    const expectedSnapshotSha256 = createHash("sha256")
      .update(canonicalizeDataSnapshot(snapshot), "utf8")
      .digest("hex");

    expect(receipt).toEqual({
      schemaVersion: "1",
      documentId: "quarterly-report",
      format: "docs",
      theme: "ivory-editorial",
      registryVersion: "1",
      componentIds: ["executive-report", "metric-card"],
      componentVersions: {
        "executive-report": "1.0.0",
        "metric-card": "1.0.0",
      },
      snapshotSha256: expectedSnapshotSha256,
      output: {
        fileName: basename(fixture.path),
        byteLength: fixture.bytes.byteLength,
        pageCount: 2,
        sha256: expectedPdfSha256,
      },
      warnings: ["alpha warning", "beta warning"],
      createdAt: "2026-08-17T11:45:00+00:00",
    });
    expect(receipt.output.pageCount).not.toBe(999);
    expect(receipt.output.byteLength).not.toBe(1);
    expect(receipt.output.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(Object.isFrozen(receipt.componentIds)).toBe(true);
    expect(Object.isFrozen(receipt.componentVersions)).toBe(true);
    expect(Object.isFrozen(receipt.output)).toBe(true);
    expect(Object.isFrozen(receipt.warnings)).toBe(true);

    const serialized = JSON.stringify(receipt);
    expect(JSON.parse(serialized)).toEqual(receipt);
    expect(serialized).not.toContain(fixture.path);
    expect(serialized).not.toContain("classified-cell");
    expect(serialized).not.toContain(snapshot.providerId);
    expect(serialized).not.toContain(snapshot.sourceRef);
    expect(serialized).not.toContain("providerId");
    expect(serialized).not.toContain("sourceRef");
  });

  test("receives the exact immutable component IDs produced by the production composer", async () => {
    const productionManifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "metric-receipt",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "revenue-card",
          selection: { kind: "primitive", id: "metric-card" },
          props: { label: "Revenue", value: "$1.2M" },
        },
      ],
      snapshotRef: snapshot.snapshotId,
    });
    const page = productionManifest.pages[0];
    if (page === undefined) {
      throw new Error("Expected production manifest page.");
    }
    const composition = await composeDocumentPageWithMetadata(
      productionManifest,
      page,
      packageRoot
    );
    const fixture = await createPdfFixture(1);

    const receipt = await buildPdfBuildReceipt({
      manifest: productionManifest,
      registry: await loadRegistry(packageRoot),
      componentIds: composition.componentIds,
      snapshot,
      mergeResult: {
        path: fixture.path,
        pageCount: 0,
        fileSize: "0 B",
      },
      warnings: [],
      createdAt: "2026-08-17T11:45:00+00:00",
    });

    expect(composition.componentIds).toEqual(["metric-card"]);
    expect(Object.isFrozen(composition.componentIds)).toBe(true);
    expect(receipt.componentIds).toEqual(composition.componentIds);
    expect(receipt.componentVersions).toEqual({ "metric-card": "1.0.0" });
    expect(Object.isFrozen(receipt.componentIds)).toBe(true);
    expect(Object.isFrozen(receipt.componentVersions)).toBe(true);
  });

  test("derives component version provenance from the loaded registry", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);
    const versionedRegistry = {
      ...input.registry,
      entries: input.registry.entries.map((entry) =>
        entry.id === "metric-card" ? { ...entry, version: "2.4.1" } : entry
      ),
    };

    const receipt = await buildPdfBuildReceipt({
      ...input,
      registry: versionedRegistry,
    });

    expect(receipt.componentVersions).toEqual({
      "executive-report": "1.0.0",
      "metric-card": "2.4.1",
    });
  });

  test("rejects unknown provider, token, config and secret fields at the trusted-host boundary", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);
    const forbiddenFields = [
      { provider: "deepsql" },
      { providerToken: "top-secret" },
      { config: { endpoint: "https://database.invalid" } },
      { secret: "top-secret" },
      { unknownField: true },
    ];

    for (const forbidden of forbiddenFields) {
      await expect(
        buildPdfBuildReceipt({ ...input, ...forbidden })
      ).rejects.toThrow();
    }
    await expect(
      buildPdfBuildReceipt({
        ...input,
        mergeResult: { ...input.mergeResult, token: "nested-secret" },
      })
    ).rejects.toThrow();
  });

  test("rejects empty, oversized and secret-bearing warnings before persistence", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);
    const invalidWarnings = [
      "   ",
      "x".repeat(513),
      "Bearer credential-value",
      "api_key credential-value",
      "api-key credential-value",
      "token=credential-value",
      "password=credential-value",
      "secret=credential-value",
      "authorization: credential-value",
      "passwd=credential-value",
      "private_key: credential-value",
      "accessToken=credential-value",
      "auth_token: credential-value",
      "clientSecret=credential-value",
      "refresh-token: credential-value",
      "sessionToken=credential-value",
      "secretKey: credential-value",
      "pwd=credential-value",
      "Basic credential-value",
    ];

    for (const warning of invalidWarnings) {
      await expect(
        buildPdfBuildReceipt({ ...input, warnings: [warning] })
      ).rejects.toThrow();
    }
  });

  test("requires manifest snapshotRef to match the hashed snapshot", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);

    await expect(
      buildPdfBuildReceipt({
        ...input,
        manifest: { ...input.manifest, snapshotRef: undefined },
      })
    ).rejects.toThrow("snapshotRef must match");
    await expect(
      buildPdfBuildReceipt({
        ...input,
        manifest: { ...input.manifest, snapshotRef: "different-snapshot" },
      })
    ).rejects.toThrow("snapshotRef must match");
  });

  test("requires listed components to include manifest selections and exist in the registry", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);

    await expect(
      buildPdfBuildReceipt({ ...input, componentIds: [] })
    ).rejects.toThrow("executive-report");
    await expect(
      buildPdfBuildReceipt({
        ...input,
        componentIds: [...input.componentIds, "unregistered-component"],
      })
    ).rejects.toThrow("unregistered-component");
  });

  test("rejects unsafe component IDs while allowing duplicate safe IDs to be deduplicated", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);
    const unsafeIds = [
      "../metric-card",
      "metric card",
      "blocks/report",
      "blocks\\report",
      "metric-card;DROP TABLE registry",
      "a".repeat(129),
    ];

    for (const componentId of unsafeIds) {
      await expect(
        buildPdfBuildReceipt({ ...input, componentIds: [componentId] })
      ).rejects.toThrow();
    }
  });

  test("rejects missing, non-file, empty, malformed and zero-page PDF outputs", async () => {
    const root = await mkdtemp(join(tmpdir(), "pdf-forge-receipt-invalid-"));
    temporaryRoots.push(root);
    const missingPath = join(root, "missing.pdf");
    const emptyPath = join(root, "empty.pdf");
    const malformedPath = join(root, "malformed.pdf");
    await writeFile(emptyPath, new Uint8Array());
    await writeFile(malformedPath, "not a pdf", "utf8");
    const zeroPage = await createPdfFixture(0);

    await expect(
      buildPdfBuildReceipt(receiptInput(missingPath))
    ).rejects.toThrow();
    await expect(buildPdfBuildReceipt(receiptInput(root))).rejects.toThrow();
    await expect(
      buildPdfBuildReceipt(receiptInput(emptyPath))
    ).rejects.toThrow();
    await expect(
      buildPdfBuildReceipt(receiptInput(malformedPath))
    ).rejects.toThrow();
    await expect(
      buildPdfBuildReceipt(receiptInput(zeroPage.path))
    ).rejects.toThrow();
  });

  test("rejects an unsafe output basename instead of persisting it", async () => {
    const fixture = await createPdfFixture();
    const unsafePath = join(dirname(fixture.path), "unsafe\nname.pdf");
    await writeFile(unsafePath, fixture.bytes);

    await expect(
      buildPdfBuildReceipt(receiptInput(unsafePath))
    ).rejects.toThrow();
  });

  test("requires an explicit offset datetime without including it in the snapshot digest", async () => {
    const fixture = await createPdfFixture();
    const input = receiptInput(fixture.path);
    const first = await buildPdfBuildReceipt(input);
    const secondCreatedAt = "2026-08-18T08:15:00-03:00";
    const second = await buildPdfBuildReceipt({
      ...input,
      createdAt: secondCreatedAt,
    });
    const { createdAt: _createdAt, ...withoutCreatedAt } = input;

    expect(second.createdAt).toBe(secondCreatedAt);
    expect(second.snapshotSha256).toBe(first.snapshotSha256);
    await expect(
      buildPdfBuildReceipt(withoutCreatedAt)
    ).rejects.toThrow();
    await expect(
      buildPdfBuildReceipt({
        ...input,
        createdAt: "2026-08-18T08:15:00",
      })
    ).rejects.toThrow();
  });
});
