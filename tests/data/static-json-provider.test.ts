import { afterEach, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StaticJsonProvider } from "../../src/data/providers/static-json.js";

const temporaryDirectories: string[] = [];

const validSnapshot = {
  schemaVersion: "1",
  snapshotId: "snapshot-2026-08-17",
  providerId: "static-json",
  sourceRef: "fixtures/monthly-report",
  mode: "read-only",
  capturedAt: "2026-08-17T10:30:00+00:00",
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
  ],
  rows: [["south", 1250.5]],
};

async function makeTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pdf-forge-static-json-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe("StaticJsonProvider", () => {
  test("loads and validates an explicitly requested local snapshot", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "snapshot.json");
    await writeFile(filePath, JSON.stringify(validSnapshot), "utf8");
    const provider = new StaticJsonProvider();

    const snapshot = await provider.load(
      { filePath },
      { signal: new AbortController().signal }
    );

    expect(provider.id).toBe("static-json");
    expect(snapshot).toEqual(validSnapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.columns)).toBe(true);
    expect(Object.isFrozen(snapshot.columns[0])).toBe(true);
    expect(Object.isFrozen(snapshot.rows)).toBe(true);
    expect(Object.isFrozen(snapshot.rows[0])).toBe(true);
  });

  test("reads exactly the requested path without sibling fallback", async () => {
    const directory = await makeTemporaryDirectory();
    const requestedPath = join(directory, "requested.json");
    const siblingPath = join(directory, "snapshot.json");
    await writeFile(
      requestedPath,
      JSON.stringify({ ...validSnapshot, rows: [["requested", 1]] }),
      "utf8"
    );
    await writeFile(
      siblingPath,
      JSON.stringify({ ...validSnapshot, rows: [["sibling", 2]] }),
      "utf8"
    );
    const provider = new StaticJsonProvider();

    const snapshot = await provider.load(
      { filePath: requestedPath },
      { signal: new AbortController().signal }
    );

    expect(snapshot.rows).toEqual([["requested", 1]]);
  });

  test("rejects malformed JSON contextually without exposing file contents", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "malformed.json");
    const sensitiveMalformedJson = '{"private":"do-not-log",';
    await writeFile(filePath, sensitiveMalformedJson, "utf8");
    const provider = new StaticJsonProvider();
    let rejection: unknown;

    try {
      await provider.load(
        { filePath },
        { signal: new AbortController().signal }
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    if (!(rejection instanceof Error)) {
      throw new Error("Expected StaticJsonProvider to reject with an Error.");
    }
    expect(rejection.message).toBe(
      `Failed to parse static JSON file "${filePath}".`
    );
    expect(rejection.message).not.toContain("do-not-log");
  });

  test("enforces trusted host snapshot limits", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "too-many-rows.json");
    await writeFile(
      filePath,
      JSON.stringify({
        ...validSnapshot,
        rows: [validSnapshot.rows[0], validSnapshot.rows[0]],
      }),
      "utf8"
    );
    const provider = new StaticJsonProvider({ snapshotLimits: { maxRows: 1 } });

    await expect(
      provider.load(
        { filePath },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow();
  });

  test("counts all file bytes, including whitespace, against maxFileBytes", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "oversize.json");
    const serializedSnapshot = JSON.stringify(validSnapshot);
    const maxFileBytes = Buffer.byteLength(serializedSnapshot, "utf8");
    await writeFile(filePath, `\n${serializedSnapshot}\n`, "utf8");
    const provider = new StaticJsonProvider({ maxFileBytes });

    await expect(
      provider.load(
        { filePath },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow(
      `Static JSON file "${filePath}" exceeds maximum size of ${maxFileBytes} bytes.`
    );
  });

  test("rejects unknown request fields", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "snapshot.json");
    await writeFile(filePath, JSON.stringify(validSnapshot), "utf8");
    const provider = new StaticJsonProvider();

    await expect(
      provider.load(
        { filePath, fallbackPath: join(directory, "fallback.json") },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow("Invalid static-json request.");
  });

  test("fails closed when the requested path is missing", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "missing.json");
    const provider = new StaticJsonProvider();

    await expect(
      provider.load(
        { filePath },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow(`Static JSON file "${filePath}" is unavailable.`);
  });

  test("fails closed when the requested path is not a regular file", async () => {
    const directory = await makeTemporaryDirectory();
    const provider = new StaticJsonProvider();

    await expect(
      provider.load(
        { filePath: directory },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow(
      `Static JSON path "${directory}" is not a regular file.`
    );
  });

  test("rejects snapshots declared for another provider", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "wrong-provider.json");
    await writeFile(
      filePath,
      JSON.stringify({ ...validSnapshot, providerId: "other-provider" }),
      "utf8"
    );
    const provider = new StaticJsonProvider();

    await expect(
      provider.load(
        { filePath },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow(
      `Static JSON file "${filePath}" declares providerId "other-provider"; expected "static-json".`
    );
  });

  test("preserves a pre-aborted signal before touching the requested path", async () => {
    const directory = await makeTemporaryDirectory();
    const filePath = join(directory, "missing.json");
    const controller = new AbortController();
    const abortReason = new DOMException("cancelled before stat", "AbortError");
    controller.abort(abortReason);
    const provider = new StaticJsonProvider();

    await expect(
      provider.load({ filePath }, { signal: controller.signal })
    ).rejects.toBe(abortReason);
  });
});
