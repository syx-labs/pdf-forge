import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import type { DataProvider, DataProviderLoadContext } from "../provider.js";
import { DataLimitOverridesSchema, DEFAULT_DATA_LIMITS } from "../limits.js";
import { parseDataSnapshot } from "../schemas.js";
import type { DataLimitOverrides, DataSnapshot } from "../types.js";

const StaticJsonRequestSchema = z
  .strictObject({
    filePath: z
      .string()
      .min(1)
      .refine((filePath) => filePath.trim().length > 0),
  })
  .readonly();

const StaticJsonProviderOptionsSchema = z
  .strictObject({
    maxFileBytes: z.number().int().positive().optional(),
    snapshotLimits: DataLimitOverridesSchema.optional(),
  })
  .readonly();

export type StaticJsonProviderOptions = Readonly<{
  maxFileBytes?: number;
  snapshotLimits?: DataLimitOverrides;
}>;

function readFilePath(request: unknown): string {
  const parsedRequest = StaticJsonRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    throw new Error("Invalid static-json request.");
  }
  return parsedRequest.data.filePath;
}

export class StaticJsonProvider implements DataProvider {
  readonly id = "static-json";
  readonly #maxFileBytes: number;
  readonly #snapshotLimits: DataLimitOverrides | undefined;

  constructor(options: StaticJsonProviderOptions = {}) {
    const parsedOptions = StaticJsonProviderOptionsSchema.parse(options);
    this.#maxFileBytes =
      parsedOptions.maxFileBytes ?? DEFAULT_DATA_LIMITS.maxEncodedBytes;
    this.#snapshotLimits = parsedOptions.snapshotLimits;
  }

  async load(
    request: unknown,
    context: DataProviderLoadContext
  ): Promise<DataSnapshot> {
    const filePath = readFilePath(request);
    context.signal.throwIfAborted();
    const fileStats = await stat(filePath).catch(() => {
      throw new Error(`Static JSON file "${filePath}" is unavailable.`);
    });
    if (!fileStats.isFile()) {
      throw new Error(`Static JSON path "${filePath}" is not a regular file.`);
    }
    if (fileStats.size > this.#maxFileBytes) {
      throw new Error(
        `Static JSON file "${filePath}" exceeds maximum size of ${this.#maxFileBytes} bytes.`
      );
    }
    context.signal.throwIfAborted();
    const contents = await readFile(filePath, { signal: context.signal });
    if (contents.byteLength > this.#maxFileBytes) {
      throw new Error(
        `Static JSON file "${filePath}" exceeds maximum size of ${this.#maxFileBytes} bytes.`
      );
    }
    context.signal.throwIfAborted();
    let decoded: unknown;
    try {
      decoded = JSON.parse(contents.toString("utf8"));
    } catch {
      throw new Error(`Failed to parse static JSON file "${filePath}".`);
    }
    const snapshot = parseDataSnapshot(decoded, this.#snapshotLimits);
    if (snapshot.providerId !== this.id) {
      throw new Error(
        `Static JSON file "${filePath}" declares providerId "${snapshot.providerId}"; expected "${this.id}".`
      );
    }
    return snapshot;
  }
}
