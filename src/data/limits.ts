import { z } from "zod";

const PositiveLimitSchema = z.number().int().positive();

const DataLimitsObjectSchema = z.strictObject({
  maxRows: PositiveLimitSchema,
  maxColumns: PositiveLimitSchema,
  maxEncodedBytes: PositiveLimitSchema,
});

export const DataLimitsSchema = DataLimitsObjectSchema.readonly();
export const DataLimitOverridesSchema = DataLimitsObjectSchema.partial().readonly();

export const DEFAULT_DATA_LIMITS = DataLimitsSchema.parse({
  maxRows: 10_000,
  maxColumns: 100,
  maxEncodedBytes: 5_242_880,
});

export function resolveDataLimits(overrides?: unknown) {
  const parsedOverrides = DataLimitOverridesSchema.parse(overrides ?? {});

  return DataLimitsSchema.parse({
    ...DEFAULT_DATA_LIMITS,
    ...parsedOverrides,
  });
}
