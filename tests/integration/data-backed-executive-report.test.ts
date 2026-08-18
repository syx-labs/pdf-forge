import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { mergePages } from "../../src/core/merger";
import { renderPages } from "../../src/core/renderer";
import { bindExecutiveReport } from "../../src/data/bindings/executive-report";
import {
  canonicalizeDataSnapshot,
  hashDataSnapshot,
} from "../../src/data/canonicalize";
import {
  parseDeepSqlRequest,
  parseDeepSqlResponse,
} from "../../src/data/providers/deepsql-contract";
import { DeepSqlProvider } from "../../src/data/providers/deepsql";
import { composeDocumentPageWithMetadata } from "../../src/registry/compose";
import { parseDocumentManifest } from "../../src/registry/document-manifest";
import { loadRegistry } from "../../src/registry/loader";
import { buildPdfBuildReceipt } from "../../src/registry/receipt";

const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURE_PATH = join(
  PACKAGE_ROOT,
  "tests/fixtures/data/deepsql-executive-report-response.json"
);
const CREATED_AT = "2026-08-17T12:00:00+00:00";
const FORBIDDEN_PROPERTY_NAMES = new Set([
  "apikey",
  "authorization",
  "authtoken",
  "connectionstring",
  "credential",
  "credentials",
  "password",
  "passwd",
  "privatekey",
  "rawsql",
  "secret",
  "sql",
  "token",
]);
const FORBIDDEN_TEXT_PATTERN =
  /(?:api[_-]?key|authorization|auth[_-]?token|connection[_-]?string|credentials?|password|passwd|private[_-]?key|raw[_-]?sql|\bsql\b|secret|\btoken\b)/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedPropertyName(name: string): string {
  return name.replaceAll(/[^A-Za-z0-9]/gu, "").toLowerCase();
}

function forbiddenPropertyPaths(value: unknown, path = "$", found: string[] = []): string[] {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      forbiddenPropertyPaths(item, `${path}[${index}]`, found)
    );
    return found;
  }
  if (!isRecord(value)) {
    return found;
  }

  for (const [name, nested] of Object.entries(value)) {
    const propertyPath = `${path}.${name}`;
    if (FORBIDDEN_PROPERTY_NAMES.has(normalizedPropertyName(name))) {
      found.push(propertyPath);
    }
    forbiddenPropertyPaths(nested, propertyPath, found);
  }
  return found;
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) {
    return;
  }
  expect(Object.isFrozen(value)).toBe(true);
  for (const nested of Object.values(value)) {
    expectDeeplyFrozen(nested);
  }
}

function expectJsonRoundTrip(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Expected a JSON-serializable value.");
  }
  const decoded: unknown = JSON.parse(serialized);
  expect(decoded).toEqual(value);
}

function expectTextWithoutGovernanceLabels(text: string, inertCanary: string): void {
  expect(text).not.toMatch(FORBIDDEN_TEXT_PATTERN);
  expect(text).not.toContain(inertCanary);
}

describe("governed DeepSQL to registry PDF acceptance", () => {
  test("validates, binds, composes, renders, merges, and receipts a read-only executive report", async () => {
    const inertCanary = "pdf-forge-inert-acceptance-canary";
    const request = parseDeepSqlRequest({
      schemaVersion: "1",
      operation: "query",
      mode: "read-only",
      queryId: "executive-report-v1",
      parameters: { period: "2026-Q3" },
    });
    expect(request).toEqual({
      schemaVersion: "1",
      operation: "query",
      mode: "read-only",
      queryId: "executive-report-v1",
      parameters: { period: "2026-Q3" },
    });
    expect(request.mode).toBe("read-only");
    expectDeeplyFrozen(request);
    expectJsonRoundTrip(request);

    const fixtureInput: unknown = JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
    const response = parseDeepSqlResponse(fixtureInput);
    expect(response.mode).toBe("read-only");
    expect(response.columns).toEqual([
      { name: "region", type: "string" },
      { name: "revenue", type: "number" },
      { name: "target", type: "number" },
      { name: "recommendation", type: "string" },
    ]);
    expect(response.rows.length).toBeGreaterThanOrEqual(2);
    expect(response.provenance.queryId).toBe(request.queryId);
    expect(response.provenance.queryDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(response.provenance.freshnessAt).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/u);
    expectDeeplyFrozen(response);
    expectJsonRoundTrip(response);
    expect(JSON.stringify(response)).not.toContain(inertCanary);

    const transportedRequests: unknown[] = [];
    let receivedAuthorization: string | null = null;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(outgoing) {
        const transported: unknown = await outgoing.json();
        transportedRequests.push(transported);
        receivedAuthorization = outgoing.headers.get("authorization");
        expect(outgoing.method).toBe("POST");
        expect(transported).toEqual(request);
        return Response.json(response);
      },
    });
    const provider = new DeepSqlProvider({
      baseUrl: new URL("/deepsql", server.url).toString(),
      authToken: inertCanary,
      timeoutMs: 1_000,
      allowedQueryIds: ["executive-report-v1"],
      validateFreshness: () => true,
      validateParameters(queryId, parameters) {
        return (
          queryId === "executive-report-v1" &&
          Object.keys(parameters).length === 1 &&
          typeof parameters.period === "string" &&
          /^20\d{2}-Q[1-4]$/u.test(parameters.period)
        );
      },
    });
    const snapshot = await provider
      .load(request, {
        signal: new AbortController().signal,
      })
      .finally(async () => {
        await server.stop(true);
      });

    expect(transportedRequests).toEqual([request]);
    expect(receivedAuthorization).toBe(`Bearer ${inertCanary}`);
    expect(snapshot).toMatchObject({
      schemaVersion: "1",
      providerId: "deepsql",
      mode: "read-only",
      sourceRef: response.provenance.sourceRef,
      capturedAt: response.provenance.freshnessAt,
      columns: response.columns,
      rows: response.rows,
    });
    expectDeeplyFrozen(snapshot);
    expectJsonRoundTrip(snapshot);
    expect(JSON.stringify(snapshot)).not.toContain(inertCanary);

    const independentSnapshotHash = createHash("sha256")
      .update(canonicalizeDataSnapshot(snapshot), "utf8")
      .digest("hex");
    expect(hashDataSnapshot(snapshot)).toBe(independentSnapshotHash);

    const props = bindExecutiveReport(snapshot);
    expectDeeplyFrozen(props);
    expectJsonRoundTrip(props);
    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "deepsql-executive-report",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "executive-report-page",
          selection: { kind: "block", id: "executive-report" },
          props,
        },
      ],
      snapshotRef: snapshot.snapshotId,
    });
    const page = manifest.pages[0];
    if (page === undefined) {
      throw new Error("Expected the governed manifest to contain one page.");
    }
    expectDeeplyFrozen(manifest);
    expectJsonRoundTrip(manifest);
    expect(JSON.stringify(manifest)).not.toContain(inertCanary);

    const registry = await loadRegistry(PACKAGE_ROOT);
    const composition = await composeDocumentPageWithMetadata(
      manifest,
      page,
      PACKAGE_ROOT
    );
    const html = composition.html;
    expect(composition.componentIds).toEqual([
      "data-table",
      "executive-report",
      "metric-card",
    ]);
    expect(Object.isFrozen(composition)).toBe(true);
    expect(Object.isFrozen(composition.componentIds)).toBe(true);
    expect(html.match(/<html\b/gu)).toHaveLength(1);
    expect(html.match(/<body\b/gu)).toHaveLength(1);
    expect(html.match(/<\/body>/gu)).toHaveLength(1);
    expect(html.match(/<\/html>/gu)).toHaveLength(1);
    expect(html).not.toMatch(/<(?:script|link|iframe|object|embed)\b/iu);
    expect(html).not.toContain("{{");
    expect(html).not.toContain("data-pdf-forge-slot");
    expect(html).toContain("Executive revenue report");
    expect(html).toContain("North");
    expect(html).toContain("Protect enterprise retention.");

    const tempRoot = await mkdtemp(
      join(tmpdir(), "pdf-forge-data-backed-executive-report-")
    );
    try {
      const pagesDir = join(tempRoot, "pages");
      const renderedDir = join(tempRoot, "rendered");
      const outputPath = join(tempRoot, "executive-report.pdf");
      await mkdir(pagesDir, { recursive: true });
      await writeFile(join(pagesDir, "01-executive-report.html"), html, "utf8");

      const rendered = await renderPages({
        inputDir: pagesDir,
        outputDir: renderedDir,
        format: "docs",
        scale: 1,
      });
      expect(rendered.files).toHaveLength(1);
      expect(rendered.format).toBe("docs");

      const mergeResult = await mergePages({
        inputDir: renderedDir,
        outputPath,
      });
      const pdfBytes = await readFile(outputPath);
      expect(new TextDecoder().decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
      const pdf = await PDFDocument.load(pdfBytes);
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);

      const receipt = await buildPdfBuildReceipt({
        manifest,
        registry,
        componentIds: composition.componentIds,
        snapshot,
        mergeResult,
        warnings: [],
        createdAt: CREATED_AT,
      });
      const independentPdfHash = createHash("sha256")
        .update(pdfBytes)
        .digest("hex");
      expect(receipt).toEqual({
        schemaVersion: "1",
        documentId: manifest.documentId,
        format: "docs",
        theme: "ivory-editorial",
        registryVersion: "1",
        componentIds: ["data-table", "executive-report", "metric-card"],
        snapshotSha256: independentSnapshotHash,
        output: {
          fileName: "executive-report.pdf",
          byteLength: pdfBytes.byteLength,
          pageCount: pdf.getPageCount(),
          sha256: independentPdfHash,
        },
        warnings: [],
        createdAt: CREATED_AT,
      });
      expect(receipt.snapshotSha256).toBe(hashDataSnapshot(snapshot));
      expect(receipt.output.byteLength).toBe(pdfBytes.byteLength);
      expect(receipt.output.pageCount).toBe(pdf.getPageCount());
      expectDeeplyFrozen(receipt);
      expectJsonRoundTrip(receipt);

      const governedObjects: readonly unknown[] = [
        request,
        response,
        snapshot,
        manifest,
        receipt,
      ];
      for (const governedObject of governedObjects) {
        expect(forbiddenPropertyPaths(governedObject)).toEqual([]);
      }

      const metadata = {
        title: pdf.getTitle(),
        author: pdf.getAuthor(),
        subject: pdf.getSubject(),
        keywords: pdf.getKeywords(),
        creator: pdf.getCreator(),
        producer: pdf.getProducer(),
      };
      const extractedMetadataStrings = Object.values(metadata).filter(
        (value): value is string => typeof value === "string"
      );
      expect(extractedMetadataStrings.length).toBeGreaterThanOrEqual(1);
      expectTextWithoutGovernanceLabels(html, inertCanary);
      for (const metadataText of extractedMetadataStrings) {
        expectTextWithoutGovernanceLabels(metadataText, inertCanary);
      }
      expectTextWithoutGovernanceLabels(JSON.stringify(receipt), inertCanary);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
