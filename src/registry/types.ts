import type { z } from "zod";
import type {
  BlockRegistryEntrySchema,
  PrimitiveRegistryEntrySchema,
  RegistryEntrySchema,
  RegistryFormatSchema,
  RegistrySchema,
} from "./schemas.js";

export type RegistryFormat = z.infer<typeof RegistryFormatSchema>;
export type PrimitiveRegistryEntry = z.infer<
  typeof PrimitiveRegistryEntrySchema
>;
export type BlockRegistryEntry = z.infer<typeof BlockRegistryEntrySchema>;
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;
export type Registry = z.infer<typeof RegistrySchema>;
