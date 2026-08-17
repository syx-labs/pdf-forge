import { z } from "zod";
import { parseDataSnapshot } from "./schemas.js";
import type { DataSnapshot } from "./types.js";

const DEFAULT_REPLACEMENT = "[REDACTED]";
const MAX_REPLACEMENT_LENGTH = 256;

const PolicyColumnNameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/);

const PolicyColumnsSchema = z
  .array(PolicyColumnNameSchema)
  .superRefine((columns, context) => {
    const seen = new Set<string>();
    columns.forEach((column, index) => {
      if (seen.has(column)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate redaction policy column: ${column}`,
          path: [index],
        });
      }
      seen.add(column);
    });
  })
  .readonly();

const ReplacementSchema = z
  .string()
  .min(1)
  .max(MAX_REPLACEMENT_LENGTH)
  .refine((replacement) => replacement.trim().length > 0, {
    message: "Redaction replacement must not be whitespace-only.",
  })
  .default(DEFAULT_REPLACEMENT);

const RedactionPolicySchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("allow"),
    columns: PolicyColumnsSchema,
    replacement: ReplacementSchema,
  }),
  z.strictObject({
    mode: z.literal("deny"),
    columns: PolicyColumnsSchema,
    replacement: ReplacementSchema,
  }),
]);

export function redactDataSnapshot(
  snapshot: DataSnapshot,
  policy: unknown
): DataSnapshot {
  const parsedPolicy = RedactionPolicySchema.parse(policy);
  const snapshotColumnNames = new Set(
    snapshot.columns.map((column) => column.name)
  );

  for (const column of parsedPolicy.columns) {
    if (!snapshotColumnNames.has(column)) {
      throw new Error(
        `Redaction policy column "${column}" does not exist in the snapshot.`
      );
    }
  }

  const policyColumnNames = new Set(parsedPolicy.columns);
  const redactedColumnIndexes = snapshot.columns.map((column) =>
    parsedPolicy.mode === "deny"
      ? policyColumnNames.has(column.name)
      : !policyColumnNames.has(column.name)
  );
  const columns = snapshot.columns.map((column, index) => ({
    name: column.name,
    type: redactedColumnIndexes[index] ? "string" : column.type,
  }));
  const rows = snapshot.rows.map((row) =>
    row.map((value, index) =>
      redactedColumnIndexes[index] ? parsedPolicy.replacement : value
    )
  );

  return parseDataSnapshot({
    ...snapshot,
    columns,
    rows,
  });
}
