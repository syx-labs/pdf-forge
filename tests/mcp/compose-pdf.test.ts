import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { hashDataSnapshot } from "../../src/data/canonicalize";
import { redactDataSnapshot } from "../../src/data/redact";
import { parseDataSnapshot } from "../../src/data/schemas";
import { createServer } from "../../src/mcp/server";

const temporaryRoots: string[] = [];
const embeddedSnapshotInput = {
  schemaVersion: "1",
  snapshotId: "snapshot-mcp-2026-q3",
  providerId: "embedded-fixture",
  sourceRef: "fixtures.mcp-executive-report",
  mode: "read-only",
  capturedAt: "2026-08-17T10:30:00+00:00",
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
    { name: "target", type: "number" },
    { name: "recommendation", type: "string" },
    { name: "private_note", type: "string" },
  ],
  rows: [
    [
      "North",
      125000,
      120000,
      "Protect enterprise retention.",
      "board-eyes-only",
    ],
    [
      "South",
      98000,
      105000,
      "Accelerate qualified pipeline.",
      "restricted-forecast",
    ],
  ],
} as const;
const validManifest = {
  schemaVersion: "1",
  documentId: "mcp-executive-report",
  format: "docs",
  theme: "ivory-editorial",
  pages: [
    {
      id: "executive-report",
      selection: { kind: "block", id: "executive-report" },
      props: {},
    },
  ],
  snapshotRef: embeddedSnapshotInput.snapshotId,
} as const;

async function withMcpClient<Result>(
  run: (client: Client) => Promise<Result>
): Promise<Result> {
  const server = await createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "compose-pdf-test", version: "1.0.0" });

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return await run(client);
  } finally {
    try {
      await client.close();
    } finally {
      await server.close();
    }
  }
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readToolText(result: unknown): string {
  if (!isUnknownRecord(result) || !Array.isArray(result.content)) {
    throw new Error("Expected the MCP tool to return content.");
  }
  const content: unknown = result.content[0];
  if (
    !isUnknownRecord(content) ||
    content.type !== "text" ||
    typeof content.text !== "string"
  ) {
    throw new Error("Expected the MCP tool to return JSON text content.");
  }
  return content.text;
}

function readToolJson(result: unknown): unknown {
  const parsed: unknown = JSON.parse(readToolText(result));
  return parsed;
}

async function makeTemporaryRoot(prefix = "pdf-forge-compose-mcp-test-") {
  const root = await mkdtemp(join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

async function composeTemporaryEntries(): Promise<readonly string[]> {
  return (await readdir(tmpdir()))
    .filter((entry: string) => entry.startsWith("pdf-forge-compose-mcp-"))
    .sort();
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("compose_pdf MCP tool", () => {
  test("lists structured compose_pdf alongside legacy generate_pdf", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);

      expect(names).toContain("compose_pdf");
      expect(names).toContain("generate_pdf");
    });
  });

  test("composes an embedded governed snapshot into a verified PDF and receipt", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "nested", "executive-report.pdf");

    const result = await withMcpClient((client) =>
      client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: validManifest,
          data: { kind: "embedded", snapshot: embeddedSnapshotInput },
          outputPath,
        },
      })
    );

    expect(result.isError).not.toBe(true);
    const response = readToolJson(result);
    expect(response).toMatchObject({
      ok: true,
      path: outputPath,
      receipt: {
        schemaVersion: "1",
        documentId: validManifest.documentId,
        format: "docs",
        theme: "ivory-editorial",
        registryVersion: "1",
        componentIds: ["data-table", "executive-report", "metric-card"],
        output: {
          fileName: basename(outputPath),
          pageCount: expect.any(Number),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        warnings: [],
        createdAt: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
        ),
      },
    });
    const verifiedResponse = readToolJson(result);
    if (
      !isUnknownRecord(verifiedResponse) ||
      !isUnknownRecord(verifiedResponse.receipt)
    ) {
      throw new Error("Expected compose_pdf receipt object.");
    }
    const receipt = verifiedResponse.receipt;
    if (!isUnknownRecord(receipt.output)) {
      throw new Error("Expected compose_pdf receipt output object.");
    }

    const pdfBytes = await readFile(outputPath);
    expect(new TextDecoder().decode(pdfBytes.subarray(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(receipt.output.byteLength).toBe(pdfBytes.byteLength);
    expect(receipt.output.pageCount).toBe(pdf.getPageCount());
    expect(receipt.output.sha256).toBe(
      createHash("sha256").update(pdfBytes).digest("hex")
    );

    const parsedSnapshot = parseDataSnapshot(embeddedSnapshotInput);
    const redacted = redactDataSnapshot(parsedSnapshot, {
      mode: "allow",
      columns: ["region", "revenue", "target", "recommendation"],
    });
    expect(receipt.snapshotSha256).toBe(hashDataSnapshot(redacted));

    const receiptText = JSON.stringify(receipt);
    for (const forbidden of [
      outputPath,
      root,
      embeddedSnapshotInput.providerId,
      embeddedSnapshotInput.sourceRef,
      "North",
      "South",
      "Protect enterprise retention.",
      "board-eyes-only",
      "restricted-forecast",
      '"rows"',
      '"providerId"',
      '"sourceRef"',
      '"filePath"',
    ]) {
      expect(receiptText).not.toContain(forbidden);
    }
    expect(await readdir(join(root, "nested"))).toEqual([
      "executive-report.pdf",
    ]);
  }, 60_000);

  test("loads an explicit local snapshot through the scoped static-json provider", async () => {
    const root = await makeTemporaryRoot();
    const snapshotPath = join(root, "governed-snapshot.json");
    const outputPath = join(root, "static-json-report.pdf");
    const staticSnapshot = {
      ...embeddedSnapshotInput,
      snapshotId: "snapshot-static-json-2026-q3",
      providerId: "static-json",
    };
    await writeFile(snapshotPath, JSON.stringify(staticSnapshot), "utf8");

    const result = await withMcpClient((client) =>
      client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: {
            ...validManifest,
            snapshotRef: staticSnapshot.snapshotId,
          },
          data: { kind: "static-json", filePath: snapshotPath },
          outputPath,
        },
      })
    );

    expect(result.isError).not.toBe(true);
    expect(readToolJson(result)).toMatchObject({
      ok: true,
      path: outputPath,
      receipt: {
        snapshotSha256: hashDataSnapshot(
          redactDataSnapshot(parseDataSnapshot(staticSnapshot), {
            mode: "allow",
            columns: ["region", "revenue", "target", "recommendation"],
          })
        ),
      },
    });
    const pdf = await PDFDocument.load(await readFile(outputPath));
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  }, 60_000);

  test("rejects an invalid manifest before creating compose temp or output paths", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "must-not-exist", "invalid.pdf");
    const before = await composeTemporaryEntries();

    const result = await withMcpClient((client) =>
      client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: {
            ...validManifest,
            theme: "private-theme-value",
          },
          data: {
            kind: "embedded",
            snapshot: {
              ...embeddedSnapshotInput,
              rows: [["must-not-be-echoed"]],
            },
          },
          outputPath,
        },
      })
    );
    const text = readToolText(result);

    expect(result.isError).toBe(true);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: {
        code: "INVALID_MANIFEST",
        message: "Manifest is not eligible for compose_pdf v1.",
        issues: [
          {
            path: "$.pages[0].selection.id",
            message:
              "Selected component does not support the manifest theme.",
          },
        ],
      },
    });
    expect(text).not.toContain("private-theme-value");
    expect(text).not.toContain("must-not-be-echoed");
    expect(text).not.toContain(outputPath);
    expect(await composeTemporaryEntries()).toEqual(before);
    expect(await pathExists(outputPath)).toBe(false);
  });

  test("rejects an oversized embedded snapshot before creating compose temp or output paths", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "must-not-exist", "oversized.pdf");
    const oversizedValue = `private-${"x".repeat(5_242_880)}`;
    const before = await composeTemporaryEntries();

    const result = await withMcpClient((client) =>
      client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: validManifest,
          data: {
            kind: "embedded",
            snapshot: {
              ...embeddedSnapshotInput,
              rows: [
                [
                  "North",
                  125000,
                  120000,
                  "Protect enterprise retention.",
                  oversizedValue,
                ],
              ],
            },
          },
          outputPath,
        },
      })
    );
    const text = readToolText(result);

    expect(result.isError).toBe(true);
    expect(JSON.parse(text)).toEqual({
      ok: false,
      error: {
        code: "SNAPSHOT_LIMIT_EXCEEDED",
        message: "Snapshot exceeds the configured compose_pdf limits.",
      },
    });
    expect(text).not.toContain(oversizedValue);
    expect(text).not.toContain(outputPath);
    expect(await composeTemporaryEntries()).toEqual(before);
    expect(await pathExists(outputPath)).toBe(false);
  });

  test("publishes a closed schema and rejects secret, SQL, provider config, and unknown fields", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "must-not-exist", "strict-schema.pdf");
    const before = await composeTemporaryEntries();
    const forbiddenFields = [
      "connectionString",
      "apiKey",
      "token",
      "credentials",
      "query",
      "sql",
      "provider",
      "config",
      "unknownField",
    ] as const;

    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      const composeTool = tools.find((tool) => tool.name === "compose_pdf");
      if (composeTool === undefined) {
        throw new Error("Expected compose_pdf in the MCP tool list.");
      }
      expect(composeTool.inputSchema).toMatchObject({
        type: "object",
        additionalProperties: false,
        required: ["manifest", "data", "outputPath"],
      });
      expect(
        JSON.stringify(composeTool.inputSchema).match(
          /"additionalProperties":false/gu
        )?.length
      ).toBeGreaterThanOrEqual(3);

      for (const field of forbiddenFields) {
        const secretValue = `must-not-echo-${field}`;
        const result = await client.callTool({
          name: "compose_pdf",
          arguments: {
            manifest: validManifest,
            data: { kind: "embedded", snapshot: embeddedSnapshotInput },
            outputPath,
            [field]: secretValue,
          },
        });
        const text = readToolText(result);
        expect(result.isError, field).toBe(true);
        expect(text, field).toContain("Input validation error");
        expect(text, field).not.toContain(secretValue);
      }

      for (const [field, secretValue] of [
        ["apiKey", "nested-api-key-value"],
        ["sql", "DROP TABLE private_records"],
      ] as const) {
        const result = await client.callTool({
          name: "compose_pdf",
          arguments: {
            manifest: validManifest,
            data: {
              kind: "embedded",
              snapshot: embeddedSnapshotInput,
              [field]: secretValue,
            },
            outputPath,
          },
        });
        const text = readToolText(result);
        expect(result.isError, field).toBe(true);
        expect(text, field).toContain("Input validation error");
        expect(text, field).not.toContain(secretValue);
      }
    });

    expect(await composeTemporaryEntries()).toEqual(before);
    expect(await pathExists(outputPath)).toBe(false);
  });

  test("rejects snapshot reference mismatches and caller-supplied block props", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "must-not-exist", "governance.pdf");
    const before = await composeTemporaryEntries();

    await withMcpClient(async (client) => {
      const mismatch = await client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: {
            ...validManifest,
            snapshotRef: "different-private-snapshot",
          },
          data: { kind: "embedded", snapshot: embeddedSnapshotInput },
          outputPath,
        },
      });
      const mismatchText = readToolText(mismatch);
      expect(mismatch.isError).toBe(true);
      expect(JSON.parse(mismatchText)).toEqual({
        ok: false,
        error: {
          code: "INVALID_MANIFEST",
          message:
            "Manifest snapshot reference does not match the governed snapshot.",
          issues: [
            {
              path: "$.snapshotRef",
              message: "Snapshot reference mismatch.",
            },
          ],
        },
      });
      expect(mismatchText).not.toContain("different-private-snapshot");
      expect(mismatchText).not.toContain(embeddedSnapshotInput.snapshotId);

      const nonemptyProps = await client.callTool({
        name: "compose_pdf",
        arguments: {
          manifest: {
            ...validManifest,
            pages: [
              {
                ...validManifest.pages[0],
                props: { privateValue: "must-not-enter-composition" },
              },
            ],
          },
          data: { kind: "embedded", snapshot: embeddedSnapshotInput },
          outputPath,
        },
      });
      const propsText = readToolText(nonemptyProps);
      expect(nonemptyProps.isError).toBe(true);
      expect(JSON.parse(propsText)).toEqual({
        ok: false,
        error: {
          code: "INVALID_MANIFEST",
          message: "Manifest is not eligible for compose_pdf v1.",
          issues: [
            {
              path: "$.pages[0].props",
              message:
                "compose_pdf supplies governed props; manifest props must be empty.",
            },
          ],
        },
      });
      expect(propsText).not.toContain("must-not-enter-composition");
      expect(propsText).not.toContain("privateValue");
    });

    expect(await composeTemporaryEntries()).toEqual(before);
    expect(await pathExists(outputPath)).toBe(false);
  });

  test("keeps legacy generate_pdf callable with its exact raw-HTML response contract", async () => {
    const root = await makeTemporaryRoot();
    const outputPath = join(root, "legacy-generate.pdf");
    const tinyDocument = [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      "<style>:root{--tw-test:0}@page{size:A4;margin:0}html,body{margin:0}main{padding:24px}</style>",
      "</head>",
      '<body><main class="w-[210mm]">Legacy generate_pdf</main></body>',
      "</html>",
    ].join("");

    const result = await withMcpClient((client) =>
      client.callTool({
        name: "generate_pdf",
        arguments: {
          format: "docs",
          pages: [tinyDocument],
          outputPath,
          scale: 1,
        },
      })
    );

    if (result.isError === true) {
      throw new Error(`Legacy generate_pdf failed: ${readToolText(result)}`);
    }
    expect(result.isError).not.toBe(true);
    expect(readToolJson(result)).toEqual({
      path: outputPath,
      pageCount: 1,
      fileSize: expect.any(String),
    });
    const response = readToolJson(result);
    if (!isUnknownRecord(response)) {
      throw new Error("Expected legacy generate_pdf JSON object.");
    }
    expect(Object.keys(response).sort()).toEqual([
      "fileSize",
      "pageCount",
      "path",
    ]);
    expect(response).not.toHaveProperty("ok");
    expect(response).not.toHaveProperty("receipt");
    const pdf = await PDFDocument.load(await readFile(outputPath));
    expect(pdf.getPageCount()).toBe(1);
  }, 60_000);
});
