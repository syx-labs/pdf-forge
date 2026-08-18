import type { z } from "zod";
import type {
  DataLimitOverridesSchema,
  DataLimitsSchema,
} from "./limits.js";
import type {
  DataColumnSchema,
  DataColumnTypeSchema,
  DataRowSchema,
  DataScalarSchema,
  DataSnapshotSchema,
} from "./schemas.js";

export type DataLimits = z.infer<typeof DataLimitsSchema>;
export type DataLimitOverrides = z.infer<typeof DataLimitOverridesSchema>;
export type DataScalar = z.infer<typeof DataScalarSchema>;
export type DataColumnType = z.infer<typeof DataColumnTypeSchema>;
export type DataColumn = z.infer<typeof DataColumnSchema>;
export type DataRow = z.infer<typeof DataRowSchema>;
export type DataSnapshot = z.infer<typeof DataSnapshotSchema>;
