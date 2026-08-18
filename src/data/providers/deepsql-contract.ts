import { Buffer } from "node:buffer";
import { z } from "zod";
import { DEFAULT_DATA_LIMITS } from "../limits.js";
import {
  DataColumnSchema,
  DataRowSchema,
  DataScalarSchema,
  parseDataSnapshot,
} from "../schemas.js";

const MAX_PARAMETER_COUNT = 64;
const MAX_PARAMETER_STRING_LENGTH = 4096;

const SafeIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/);

const ForbiddenDataNamePattern = /^(?:api[_-]?key|auth(?:orization)?|connection[_-]?string|credentials?|password|passwd|private[_-]?key|raw[_-]?sql|secret|sql|token|query)$/i;

const SafeParameterNameSchema = SafeIdentifierSchema.refine(
  (name) => !ForbiddenDataNamePattern.test(name),
  { message: "Parameter name is reserved by the DeepSQL security contract." }
);
const DeepSqlParameterScalarSchema = DataScalarSchema.refine(
  (value) => typeof value !== "string" || value.length <= MAX_PARAMETER_STRING_LENGTH,
  { message: "String parameter exceeds the DeepSQL contract limit." }
);
const DeepSqlParametersSchema = z
  .record(SafeParameterNameSchema, DeepSqlParameterScalarSchema)
  .refine((parameters) => Object.keys(parameters).length <= MAX_PARAMETER_COUNT, {
    message: `DeepSQL requests accept at most ${MAX_PARAMETER_COUNT} parameters.`,
  })
  .readonly();

export const DeepSqlRequestSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    operation: z.literal("query"),
    mode: z.literal("read-only"),
    queryId: SafeIdentifierSchema,
    parameters: DeepSqlParametersSchema.optional(),
  })
  .readonly();

export type DeepSqlRequest = z.infer<typeof DeepSqlRequestSchema>;

export function parseDeepSqlRequest(input: unknown): DeepSqlRequest {
  return DeepSqlRequestSchema.parse(input);
}

const SourceRefShapePattern = /^[A-Za-z0-9]+(?:[._:/-][A-Za-z0-9]+)*$/;
const CredentialSourceSegmentPattern =
  /(?:^|[._:/-])(?:access[._-]?key|api[._-]?key|auth(?:orization)?|connection[._-]?string|credentials?|password|passwd|private[._-]?key|secret|token)(?:[._:/-]|$)/i;
const SqlSourceSegmentPattern =
  /(?:^|[._:/-])(?:alter|call|create|delete|drop|exec(?:ute)?|grant|insert|merge|revoke|select|truncate|update)(?:[._:/-]|$)/i;
const SourceRefSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(SourceRefShapePattern)
  .refine(
    (sourceRef) =>
      !CredentialSourceSegmentPattern.test(sourceRef) &&
      !SqlSourceSegmentPattern.test(sourceRef),
    {
      message: "Source reference must be an opaque, non-sensitive identifier.",
    }
  );

const DeepSqlProvenanceSchema = z
  .strictObject({
    sourceRef: SourceRefSchema,
    freshnessAt: z.iso.datetime({ offset: true }),
    queryId: SafeIdentifierSchema,
    queryDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .readonly();

const DeepSqlResponseBaseSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  mode: z.literal("read-only"),
  snapshotId: SafeIdentifierSchema,
  columns: z
    .array(DataColumnSchema)
    .max(DEFAULT_DATA_LIMITS.maxColumns)
    .readonly(),
  rows: z.array(DataRowSchema).max(DEFAULT_DATA_LIMITS.maxRows).readonly(),
  provenance: DeepSqlProvenanceSchema,
});

export const DeepSqlResponseSchema = DeepSqlResponseBaseSchema.superRefine(
  (response, context) => {
    response.columns.forEach((column, index) => {
      if (ForbiddenDataNamePattern.test(column.name)) {
        context.addIssue({
          code: "custom",
          message: "Column name is reserved by the DeepSQL security contract.",
          path: ["columns", index, "name"],
        });
      }
    });
    const canonicalSnapshot = {
      schemaVersion: response.schemaVersion,
      snapshotId: response.snapshotId,
      providerId: "deepsql",
      sourceRef: response.provenance.sourceRef,
      mode: response.mode,
      capturedAt: response.provenance.freshnessAt,
      columns: response.columns,
      rows: response.rows,
    };
    try {
      parseDataSnapshot(canonicalSnapshot);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Response does not satisfy canonical DataSnapshot semantics.",
        path: [],
      });
    }

    const encodedBytes = Buffer.byteLength(JSON.stringify(response), "utf8");
    if (encodedBytes > DEFAULT_DATA_LIMITS.maxEncodedBytes) {
      context.addIssue({
        code: "custom",
        message: `Encoded response exceeds ${DEFAULT_DATA_LIMITS.maxEncodedBytes} UTF-8 bytes.`,
        path: [],
      });
    }
  }
).readonly();

export type DeepSqlResponse = z.infer<typeof DeepSqlResponseSchema>;

export function parseDeepSqlResponse(input: unknown): DeepSqlResponse {
  return DeepSqlResponseSchema.parse(input);
}
