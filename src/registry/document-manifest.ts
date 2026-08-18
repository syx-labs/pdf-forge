import { z } from "zod";

const ManifestIdentifierSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/);

function deepFreezeUnknown(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreezeUnknown));
  }
  if (typeof value === "object" && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, nested]) => [
          key,
          deepFreezeUnknown(nested),
        ])
      )
    );
  }
  return value;
}

const RegistrySelectionSchema = z
  .strictObject({
    kind: z.enum(["primitive", "block"]),
    id: ManifestIdentifierSchema,
  })
  .readonly();

const DocumentPageSchema = z
  .strictObject({
    id: ManifestIdentifierSchema,
    selection: RegistrySelectionSchema,
    props: z.unknown().transform(deepFreezeUnknown),
  })
  .readonly();

export const DocumentManifestSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    documentId: ManifestIdentifierSchema,
    format: z.enum(["slides", "docs"]),
    theme: ManifestIdentifierSchema,
    pages: z
      .array(DocumentPageSchema)
      .nonempty()
      .refine(
        (pages) => new Set(pages.map((page) => page.id)).size === pages.length,
        { message: "Page IDs must be unique." }
      )
      .readonly(),
    snapshotRef: ManifestIdentifierSchema.optional(),
  })
  .readonly();

export type DocumentManifest = z.infer<typeof DocumentManifestSchema>;

export function parseDocumentManifest(input: unknown): DocumentManifest {
  return DocumentManifestSchema.parse(input);
}
