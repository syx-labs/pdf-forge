import type { DataSnapshot } from "./types.js";

export type DataProviderLoadContext = Readonly<{
  signal: AbortSignal;
}>;

export interface DataProvider {
  readonly id: string;
  load(
    request: unknown,
    context: DataProviderLoadContext
  ): Promise<DataSnapshot>;
}
