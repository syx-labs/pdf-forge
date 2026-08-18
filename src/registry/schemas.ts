import { z } from "zod";

export const RegistryFormatSchema = z.enum(["slides", "docs", "social"]);

const registryEntryShape = {
  id: z.string().min(1),
  version: z.string().min(1),
  template: z.string().min(1),
  schema: z.string().min(1),
  formats: z.array(RegistryFormatSchema).nonempty(),
  themes: z.array(z.string().min(1)).nonempty(),
};

export const PrimitiveRegistryEntrySchema = z.strictObject({
  ...registryEntryShape,
  kind: z.literal("primitive"),
});

export const BlockRegistryEntrySchema = z.strictObject({
  ...registryEntryShape,
  kind: z.literal("block"),
});

export const RegistryEntrySchema = z.discriminatedUnion("kind", [
  PrimitiveRegistryEntrySchema,
  BlockRegistryEntrySchema,
]);

export const RegistrySchema = z.strictObject({
  version: z.literal("1"),
  entries: z.array(RegistryEntrySchema),
});
