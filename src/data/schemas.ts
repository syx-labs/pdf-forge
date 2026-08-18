import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  DataLimitOverridesSchema,
  resolveDataLimits,
} from "./limits.js";

const SafeIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/);
const CredentialRefPattern =
  /(?:^|[._:/-])(?:access[-_]?key|api[-_]?key|authorization|credential|password|passwd|private[-_]?key|secret|token)(?:[._:/-]|$)/i;
const SourceRefSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*$/)
  .refine((sourceRef) => !CredentialRefPattern.test(sourceRef), {
    message: "Source reference must not contain credential material.",
  });
const ColumnNameSchema = SafeIdentifierSchema;

export const DataScalarSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const DataColumnTypeSchema = z.enum([
  "string",
  "number",
  "boolean",
  "null",
]);

export const DataColumnSchema = z
  .strictObject({
    name: ColumnNameSchema,
    type: DataColumnTypeSchema,
  })
  .readonly();

export const DataRowSchema = z.array(DataScalarSchema).readonly();

function matchesDeclaredType(
  value: z.infer<typeof DataScalarSchema>,
  declaredType: z.infer<typeof DataColumnTypeSchema>
): boolean {
  if (declaredType === "null") {
    return value === null;
  }
  return typeof value === declaredType;
}

type DataLimitOverridesInput = z.input<typeof DataLimitOverridesSchema>;

export function createDataSnapshotSchema(
  limitOverrides?: DataLimitOverridesInput
) {
  const limits = resolveDataLimits(limitOverrides);

  return z
    .strictObject({
      schemaVersion: z.literal("1"),
      snapshotId: SafeIdentifierSchema,
      providerId: SafeIdentifierSchema,
      sourceRef: SourceRefSchema,
      mode: z.literal("read-only"),
      capturedAt: z.iso.datetime({ offset: true }),
      queryId: SafeIdentifierSchema.optional(),
      queryDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      columns: z.array(DataColumnSchema).max(limits.maxColumns).readonly(),
      rows: z.array(DataRowSchema).max(limits.maxRows).readonly(),
    })
    .superRefine((snapshot, context) => {
      const columnNames = new Set<string>();
      snapshot.columns.forEach((column, index) => {
        if (columnNames.has(column.name)) {
          context.addIssue({
            code: "custom",
            message: `Duplicate column name: ${column.name}`,
            path: ["columns", index, "name"],
          });
        }
        columnNames.add(column.name);
      });

      snapshot.rows.forEach((row, rowIndex) => {
        if (row.length !== snapshot.columns.length) {
          context.addIssue({
            code: "custom",
            message: `Row width must equal ${snapshot.columns.length}.`,
            path: ["rows", rowIndex],
          });
          return;
        }
        row.forEach((value, columnIndex) => {
          const column = snapshot.columns[columnIndex];
          if (
            column !== undefined &&
            !matchesDeclaredType(value, column.type)
          ) {
            context.addIssue({
              code: "custom",
              message: `Cell must match declared column type ${column.type}.`,
              path: ["rows", rowIndex, columnIndex],
            });
          }
        });
      });

      const encodedBytes = Buffer.byteLength(JSON.stringify(snapshot), "utf8");
      if (encodedBytes > limits.maxEncodedBytes) {
        context.addIssue({
          code: "custom",
          message: `Encoded snapshot exceeds ${limits.maxEncodedBytes} UTF-8 bytes.`,
          path: [],
        });
      }
    })
    .readonly();
}

export const DataSnapshotSchema = createDataSnapshotSchema();

export function parseDataSnapshot(
  input: unknown,
  limitOverrides?: DataLimitOverridesInput
) {
  return createDataSnapshotSchema(limitOverrides).parse(input);
}
