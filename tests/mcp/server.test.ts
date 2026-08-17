import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../../src/mcp/server";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const validManifest = {
  schemaVersion: "1",
  documentId: "quarterly-report",
  format: "slides",
  theme: "ivory-editorial",
  pages: [
    {
      id: "executive-summary",
      selection: { kind: "block", id: "executive-report" },
      props: { confidentialSource: "raw-private-value" },
    },
  ],
  snapshotRef: "snapshot-2026-q2",
} as const;

async function withMcpClient<Result>(
  run: (client: Client) => Promise<Result>
): Promise<Result> {
  const server = await createServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });

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

describe("MCP Server", () => {
  test("lists resources", async () => {
    await withMcpClient(async (client) => {
      const { resources } = await client.listResources();
      const uris = resources.map((resource) => resource.uri);

      expect(uris).toContain("pdf-forge://design-system");
      expect(uris).toContain("pdf-forge://templates/slides");
      expect(uris).toContain("pdf-forge://templates/docs");
      expect(uris).toContain("pdf-forge://color-palettes");
      expect(uris).toContain("pdf-forge://anti-patterns");
    });
  });

  test("reads a resource", async () => {
    await withMcpClient(async (client) => {
      const result = await client.readResource({
        uri: "pdf-forge://design-system",
      });

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toContain("Typography");
    });
  });

  test("lists generate_pdf and the read-only registry discovery tools", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name);

      expect(names).toEqual([
        "generate_pdf",
        "list_pdf_components",
        "inspect_pdf_component",
        "validate_pdf_manifest",
      ]);
    });
  });

  test("lists canonical PDF components as sorted JSON without filesystem paths", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "list_pdf_components",
        arguments: {},
      });

      expect(result.isError).not.toBe(true);
      expect(readToolJson(result)).toEqual({
        ok: true,
        registryVersion: "1",
        components: [
          {
            id: "data-table",
            kind: "primitive",
            version: "1.0.0",
            formats: ["docs", "slides"],
            themes: ["ivory-editorial"],
          },
          {
            id: "executive-report",
            kind: "block",
            version: "1.0.0",
            formats: ["docs", "slides"],
            themes: ["ivory-editorial"],
          },
          {
            id: "metric-card",
            kind: "primitive",
            version: "1.0.0",
            formats: ["docs", "slides"],
            themes: ["ivory-editorial"],
          },
        ],
      });
    });
  });

  test("inspects a canonical PDF component with registry-relative paths", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "inspect_pdf_component",
        arguments: { id: "executive-report" },
      });
      const text = readToolText(result);

      expect(result.isError).not.toBe(true);
      expect(JSON.parse(text)).toEqual({
        ok: true,
        component: {
          id: "executive-report",
          kind: "block",
          version: "1.0.0",
          formats: ["docs", "slides"],
          themes: ["ivory-editorial"],
          template: "blocks/executive-report/template.html",
          schema: "blocks/executive-report/block.yaml",
        },
      });
      expect(text).not.toContain(packageRoot);
      expect(text).not.toContain("/assets/registry/");
    });
  });

  test("returns a machine-readable error for an unknown PDF component", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "inspect_pdf_component",
        arguments: { id: "missing-component" },
      });

      expect(result.isError).toBe(true);
      expect(readToolJson(result)).toEqual({
        ok: false,
        error: {
          code: "COMPONENT_NOT_FOUND",
          message: 'PDF component "missing-component" was not found.',
          availableIds: ["data-table", "executive-report", "metric-card"],
        },
      });
    });
  });

  test("validates a manifest and returns only a minimal composition summary", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "validate_pdf_manifest",
        arguments: { manifest: validManifest },
      });
      const text = readToolText(result);

      expect(result.isError).not.toBe(true);
      expect(JSON.parse(text)).toEqual({
        ok: true,
        manifest: {
          schemaVersion: "1",
          documentId: "quarterly-report",
          format: "slides",
          theme: "ivory-editorial",
          pageCount: 1,
          pages: [
            {
              id: "executive-summary",
              kind: "block",
              componentId: "executive-report",
            },
          ],
        },
      });
      expect(text).not.toContain("props");
      expect(text).not.toContain("snapshotRef");
      expect(text).not.toContain("raw-private-value");
    });
  });

  test("rejects a structurally valid manifest whose selected components or theme are not registered", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "validate_pdf_manifest",
        arguments: {
          manifest: {
            ...validManifest,
            theme: "not-shipped",
            pages: [
              validManifest.pages[0],
              {
                id: "missing-page",
                selection: { kind: "primitive", id: "missing-component" },
                props: {},
              },
            ],
          },
        },
      });
      const text = readToolText(result);

      expect(result.isError).toBe(true);
      expect(JSON.parse(text)).toEqual({
        ok: false,
        error: {
          code: "INVALID_MANIFEST",
          message: "Manifest failed registry validation.",
          issues: [
            { path: "$.pages[0].selection.id", message: "Selected component does not support the manifest theme." },
            { path: "$.pages[1].selection.id", message: "Selected component is not registered." },
          ],
        },
      });
      expect(text).not.toContain("not-shipped");
      expect(text).not.toContain("missing-component");
    });
  });

  test("returns deterministic issue paths for an invalid semantic manifest", async () => {
    await withMcpClient(async (client) => {
      const invalidManifest = {
        ...validManifest,
        format: "social",
        pages: [
          {
            ...validManifest.pages[0],
            selection: { kind: "block", id: "../private-component" },
          },
        ],
        unexpectedManifestField: "sensitive-input-value",
      };
      const first = await client.callTool({
        name: "validate_pdf_manifest",
        arguments: { manifest: invalidManifest },
      });
      const second = await client.callTool({
        name: "validate_pdf_manifest",
        arguments: { manifest: invalidManifest },
      });
      const text = readToolText(first);

      expect(first.isError).toBe(true);
      expect(readToolText(second)).toBe(text);
      expect(JSON.parse(text)).toEqual({
        ok: false,
        error: {
          code: "INVALID_MANIFEST",
          message: "Manifest failed semantic validation.",
          issues: [
            { path: "$", message: expect.any(String) },
            { path: "$.format", message: expect.any(String) },
            {
              path: "$.pages[0].selection.id",
              message: expect.any(String),
            },
          ],
        },
      });
      expect(text).not.toContain("social");
      expect(text).not.toContain("../private-component");
      expect(text).not.toContain("sensitive-input-value");
      expect(text).not.toContain("raw-private-value");
    });
  });

  test("publishes strict MCP schemas and rejects unknown boundary fields", async () => {
    await withMcpClient(async (client) => {
      const { tools } = await client.listTools();
      const discoveryTools = tools.filter((tool) =>
        [
          "list_pdf_components",
          "inspect_pdf_component",
          "validate_pdf_manifest",
        ].includes(tool.name)
      );

      expect(discoveryTools).toHaveLength(3);
      for (const tool of discoveryTools) {
        expect(tool.inputSchema).toMatchObject({
          type: "object",
          additionalProperties: false,
        });
      }

      const rejectedCalls = await Promise.all([
        client.callTool({
          name: "list_pdf_components",
          arguments: { unexpected: true },
        }),
        client.callTool({
          name: "inspect_pdf_component",
          arguments: { id: "metric-card", unexpected: true },
        }),
        client.callTool({
          name: "validate_pdf_manifest",
          arguments: { manifest: validManifest, unexpected: true },
        }),
        client.callTool({
          name: "inspect_pdf_component",
          arguments: { id: "../metric-card" },
        }),
      ]);

      for (const result of rejectedCalls) {
        expect(result.isError).toBe(true);
        expect(readToolText(result)).toContain("Input validation error");
      }
    });
  });

  test("performs discovery reads without writing to a temporary cwd or leaking its package path", async () => {
    const originalCwd = process.cwd();
    const temporaryCwd = await mkdtemp(join(tmpdir(), "pdf-forge-mcp-readonly-"));

    try {
      process.chdir(temporaryCwd);
      const before = await readdir(temporaryCwd);

      const texts = await withMcpClient(async (client) => {
        const results = await Promise.all([
          client.callTool({ name: "list_pdf_components", arguments: {} }),
          client.callTool({
            name: "inspect_pdf_component",
            arguments: { id: "metric-card" },
          }),
          client.callTool({
            name: "validate_pdf_manifest",
            arguments: { manifest: validManifest },
          }),
        ]);

        for (const result of results) {
          expect(result.isError).not.toBe(true);
        }
        return results.map(readToolText);
      });

      expect(await readdir(temporaryCwd)).toEqual(before);
      for (const text of texts) {
        expect(text).not.toContain(packageRoot);
      }
    } finally {
      process.chdir(originalCwd);
      await rm(temporaryCwd, { recursive: true, force: true });
    }
  });
});
