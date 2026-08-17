import { describe, expect, test } from "bun:test";
import type { DataProvider } from "../../src/data/provider.js";
import { DataProviderRegistry } from "../../src/data/provider-registry.js";
import type { DataSnapshot } from "../../src/data/types.js";

function snapshot(providerId: string): DataSnapshot {
  return {
    schemaVersion: "1",
    snapshotId: `snapshot-${providerId}`,
    providerId,
    sourceRef: `fixtures/${providerId}`,
    mode: "read-only",
    capturedAt: "2026-08-17T10:30:00+00:00",
    columns: [{ name: "value", type: "string" }],
    rows: [["ready"]],
  };
}

function provider(id: string): DataProvider {
  return {
    id,
    async load() {
      return snapshot(id);
    },
  };
}

describe("DataProviderRegistry", () => {
  test("keeps registrations scoped to each registry instance", () => {
    const first = new DataProviderRegistry();
    const second = new DataProviderRegistry();

    first.register(provider("static-json"));

    expect(first.list()).toEqual(["static-json"]);
    expect(second.list()).toEqual([]);
  });

  test("registers each provider ID only once", () => {
    const registry = new DataProviderRegistry();
    const registered = provider("static-json");

    registry.register(registered);

    expect(registry.get("static-json")).toBe(registered);
    expect(() => registry.register(provider("static-json"))).toThrow(
      'Data provider "static-json" is already registered.'
    );
  });

  test("reports whether unregister removed a provider", () => {
    const registry = new DataProviderRegistry();
    registry.register(provider("static-json"));

    expect(registry.unregister("static-json")).toBe(true);
    expect(registry.unregister("static-json")).toBe(false);
    expect(registry.list()).toEqual([]);
  });

  test("rejects unsafe provider IDs", () => {
    const registry = new DataProviderRegistry();

    for (const id of [
      "",
      "../secret",
      "provider?token=secret",
      "two..dots",
      "a".repeat(129),
    ]) {
      expect(() => registry.register(provider(id))).toThrow(
        "Invalid data provider ID."
      );
    }
    expect(registry.list()).toEqual([]);
  });

  test("returns immutable sorted ID snapshots without exposing registry state", () => {
    const registry = new DataProviderRegistry();
    registry.register(provider("zeta"));
    registry.register(provider("alpha"));

    const ids = registry.list();

    expect(ids).toEqual(["alpha", "zeta"]);
    expect(Object.isFrozen(ids)).toBe(true);
    expect(Reflect.set(ids, 0, "changed")).toBe(false);
    registry.register(provider("middle"));
    expect(ids).toEqual(["alpha", "zeta"]);
    expect(registry.list()).toEqual(["alpha", "middle", "zeta"]);
  });

  test("fails closed for unknown IDs and reports sorted available IDs", () => {
    const registry = new DataProviderRegistry();
    registry.register(provider("zeta"));
    registry.register(provider("alpha"));
    const expected =
      'Unknown data provider "missing". Available provider IDs: alpha, zeta.';

    expect(() => registry.get("missing")).toThrow(expected);
    expect(() => registry.resolve("missing")).toThrow(expected);
  });

  test("routes the unmodified request and exact AbortSignal to the provider", async () => {
    const registry = new DataProviderRegistry();
    const controller = new AbortController();
    const request = { fixture: "monthly-report" };
    let receivedRequest: unknown;
    let receivedSignal: AbortSignal | undefined;
    const registered: DataProvider = {
      id: "static-json",
      async load(
        providerRequest: unknown,
        context: Readonly<{ signal: AbortSignal }>
      ) {
        receivedRequest = providerRequest;
        receivedSignal = context.signal;
        return snapshot("static-json");
      },
    };
    registry.register(registered);

    const result = await registry.load("static-json", request, {
      signal: controller.signal,
    });

    expect(result).toEqual(snapshot("static-json"));
    expect(receivedRequest).toBe(request);
    expect(receivedSignal).toBe(controller.signal);
  });

  test("rejects a pre-aborted load without calling the provider", async () => {
    const registry = new DataProviderRegistry();
    const controller = new AbortController();
    const abortReason = new DOMException("cancelled before load", "AbortError");
    let calls = 0;
    const registered: DataProvider = {
      id: "static-json",
      async load() {
        calls += 1;
        return snapshot("static-json");
      },
    };
    registry.register(registered);
    controller.abort(abortReason);

    await expect(
      registry.load("static-json", {}, { signal: controller.signal })
    ).rejects.toBe(abortReason);
    expect(calls).toBe(0);
  });

  test("captures the provider for an in-flight load despite registry mutation", async () => {
    const registry = new DataProviderRegistry();
    const controller = new AbortController();
    let releaseOriginal = () => {};
    const original: DataProvider = {
      id: "static-json",
      load() {
        return new Promise<DataSnapshot>((resolve) => {
          releaseOriginal = () => resolve(snapshot("static-json"));
        });
      },
    };
    const replacement: DataProvider = {
      id: "static-json",
      async load() {
        return { ...snapshot("static-json"), rows: [["replacement"]] };
      },
    };
    registry.register(original);

    const loading = registry.load("static-json", {}, {
      signal: controller.signal,
    });
    expect(registry.unregister("static-json")).toBe(true);
    registry.register(replacement);
    releaseOriginal();

    expect(await loading).toEqual(snapshot("static-json"));
    expect(registry.get("static-json")).toBe(replacement);
  });

  test("keeps an in-flight AbortError visible to the caller", async () => {
    const registry = new DataProviderRegistry();
    const controller = new AbortController();
    const abortReason = new DOMException("cancelled in flight", "AbortError");
    let markStarted = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const registered: DataProvider = {
      id: "static-json",
      load(
        _request: unknown,
        context: Readonly<{ signal: AbortSignal }>
      ) {
        markStarted();
        return new Promise<DataSnapshot>((_resolve, reject) => {
          context.signal.addEventListener(
            "abort",
            () => reject(context.signal.reason),
            { once: true }
          );
        });
      },
    };
    registry.register(registered);

    const loading = registry.load("static-json", {}, {
      signal: controller.signal,
    });
    await started;
    controller.abort(abortReason);

    await expect(loading).rejects.toBe(abortReason);
  });
});
