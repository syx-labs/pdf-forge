import { describe, test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server";

describe("MCP Server", () => {
  test("lists resources", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri);

    expect(uris).toContain("pdf-forge://design-system");
    expect(uris).toContain("pdf-forge://templates/slides");
    expect(uris).toContain("pdf-forge://templates/docs");
    expect(uris).toContain("pdf-forge://color-palettes");
    expect(uris).toContain("pdf-forge://anti-patterns");

    await client.close();
    await server.close();
  });

  test("reads a resource", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const result = await client.readResource({
      uri: "pdf-forge://design-system",
    });
    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].text).toContain("Typography");

    await client.close();
    await server.close();
  });

  test("lists generate_pdf tool", async () => {
    const server = createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();

    await server.connect(serverTransport);

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("generate_pdf");

    await client.close();
    await server.close();
  });
});
