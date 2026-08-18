import type {
  DataProvider,
  DataProviderLoadContext,
} from "./provider.js";
import type { DataSnapshot } from "./types.js";

const SAFE_PROVIDER_ID_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;
const MAX_PROVIDER_ID_LENGTH = 128;

function isSafeProviderId(id: string): boolean {
  return (
    id.length <= MAX_PROVIDER_ID_LENGTH && SAFE_PROVIDER_ID_PATTERN.test(id)
  );
}

export class DataProviderRegistry {
  readonly #providers = new Map<string, DataProvider>();

  register(provider: DataProvider): void {
    if (!isSafeProviderId(provider.id)) {
      throw new Error("Invalid data provider ID.");
    }
    if (this.#providers.has(provider.id)) {
      throw new Error(`Data provider "${provider.id}" is already registered.`);
    }
    this.#providers.set(provider.id, provider);
  }

  get(id: string): DataProvider {
    return this.resolve(id);
  }

  resolve(id: string): DataProvider {
    const provider = this.#providers.get(id);
    if (provider === undefined) {
      const available = this.list();
      const availableIds = available.length === 0 ? "(none)" : available.join(", ");
      throw new Error(
        `Unknown data provider "${id}". Available provider IDs: ${availableIds}.`
      );
    }
    return provider;
  }

  unregister(id: string): boolean {
    return this.#providers.delete(id);
  }

  async load(
    id: string,
    request: unknown,
    context: DataProviderLoadContext
  ): Promise<DataSnapshot> {
    context.signal.throwIfAborted();
    const provider = this.resolve(id);
    return provider.load(request, context);
  }

  list(): readonly string[] {
    return Object.freeze([...this.#providers.keys()].sort());
  }
}
