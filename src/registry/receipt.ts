import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { PDFDocument } from "pdf-lib";
import { z } from "zod";
import { hashDataSnapshot } from "../data/canonicalize.js";
import { DataSnapshotSchema } from "../data/schemas.js";
import type { DocumentManifest } from "./document-manifest.js";
import { DocumentManifestSchema } from "./document-manifest.js";
import { RegistrySchema } from "./schemas.js";
import type { Registry } from "./types.js";

export type PdfBuildReceipt = Readonly<{
  schemaVersion: "1";
  documentId: string;
  format: DocumentManifest["format"];
  theme: string;
  registryVersion: Registry["version"];
  componentIds: readonly string[];
  snapshotSha256: string;
  output: Readonly<{
    fileName: string;
    byteLength: number;
    pageCount: number;
    sha256: string;
  }>;
  warnings: readonly string[];
  createdAt: string;
}>;

const SAFE_OUTPUT_FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;
const SafeComponentIdSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/);
const SECRET_WARNING_PATTERN =
  /(?:\bBearer\s+|\bBasic\s+|\bapi[_-]?key\b(?:\s+|\s*[:=])|\b(?:auth(?:orization)?|credentials?|password|passwd|private[_-]?key|secret|token)\b\s*[:=])/iu;
const WarningSchema = z
  .string()
  .max(512)
  .transform((warning) => warning.trim())
  .refine((warning) => warning.length > 0, {
    message: "Warnings must not be empty after trimming.",
  })
  .refine((warning) => !SECRET_WARNING_PATTERN.test(warning), {
    message: "Warnings must not contain credential material.",
  });

const ReceiptInputSchema = z.strictObject({
  manifest: DocumentManifestSchema,
  registry: RegistrySchema,
  componentIds: z.array(SafeComponentIdSchema).max(1_000).readonly(),
  snapshot: DataSnapshotSchema,
  mergeResult: z.strictObject({
    path: z.string().min(1),
    pageCount: z.number(),
    fileSize: z.string(),
  }),
  warnings: z.array(WarningSchema).max(100).readonly(),
  createdAt: z.iso.datetime({ offset: true }),
});

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)].sort());
}

export function isSafePdfOutputPath(outputPath: string): boolean {
  return SAFE_OUTPUT_FILE_NAME_PATTERN.test(basename(outputPath));
}

export function assertSafePdfOutputPath(outputPath: string): void {
  if (!isSafePdfOutputPath(outputPath)) {
    throw new Error("PDF build output must have a safe basename.");
  }
}

export async function buildPdfBuildReceipt(
  input: unknown
): Promise<PdfBuildReceipt> {
  const parsed = ReceiptInputSchema.parse(input);
  if (
    parsed.manifest.snapshotRef === undefined ||
    parsed.manifest.snapshotRef !== parsed.snapshot.snapshotId
  ) {
    throw new Error("PDF build manifest snapshotRef must match the receipt snapshot.");
  }
  const listedComponentIds = new Set(parsed.componentIds);
  const registeredComponentIds = new Set(
    parsed.registry.entries.map((entry) => entry.id)
  );
  const missingSelections = [
    ...new Set(parsed.manifest.pages.map((page) => page.selection.id)),
  ]
    .filter((id) => !listedComponentIds.has(id))
    .sort();
  const unregisteredComponents = [...listedComponentIds]
    .filter((id) => !registeredComponentIds.has(id))
    .sort();
  if (missingSelections.length > 0 || unregisteredComponents.length > 0) {
    const issues: string[] = [];
    if (missingSelections.length > 0) {
      issues.push(
        `missing manifest components: ${missingSelections.join(", ")}`
      );
    }
    if (unregisteredComponents.length > 0) {
      issues.push(
        `unregistered components: ${unregisteredComponents.join(", ")}`
      );
    }
    throw new Error(`Invalid receipt components: ${issues.join("; ")}.`);
  }
  const fileName = basename(parsed.mergeResult.path);
  assertSafePdfOutputPath(parsed.mergeResult.path);
  const outputStat = await stat(parsed.mergeResult.path);
  if (!outputStat.isFile()) {
    throw new Error("PDF build output must be a regular file.");
  }

  const bytes = await readFile(parsed.mergeResult.path);
  if (bytes.byteLength === 0) {
    throw new Error("PDF build output must not be empty.");
  }
  const pdf = await PDFDocument.load(bytes);
  const pageCount = pdf.getPageCount();
  if (pageCount === 0) {
    throw new Error("PDF build output must contain at least one page.");
  }
  const componentIds = sortedUnique(parsed.componentIds);
  const warnings = sortedUnique(parsed.warnings);
  const output = Object.freeze({
    fileName,
    byteLength: bytes.byteLength,
    pageCount,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });

  return Object.freeze({
    schemaVersion: "1",
    documentId: parsed.manifest.documentId,
    format: parsed.manifest.format,
    theme: parsed.manifest.theme,
    registryVersion: parsed.registry.version,
    componentIds,
    snapshotSha256: hashDataSnapshot(parsed.snapshot),
    output,
    warnings,
    createdAt: parsed.createdAt,
  });
}
