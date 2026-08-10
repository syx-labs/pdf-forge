import { describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const REPO_ROOT = resolve(import.meta.dir, "../..");

describe("MCP package-root discovery", () => {
  test("source MCP reads its physical package when the checkout path contains dist", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-mcp-root-"));
    try {
      const sourceRoot = join(tempDir, "distributed-source");
      await mkdir(sourceRoot, { recursive: true });

      const packageJson = JSON.parse(
        await readFile(join(REPO_ROOT, "package.json"), "utf-8")
      ) as Record<string, unknown>;
      packageJson.version = "9.8.7";
      await writeFile(
        join(sourceRoot, "package.json"),
        `${JSON.stringify(packageJson, null, 2)}\n`,
        "utf-8"
      );

      await cp(join(REPO_ROOT, "src"), join(sourceRoot, "src"), {
        recursive: true,
      });
      await mkdir(join(sourceRoot, "bin"), { recursive: true });
      await cp(
        join(REPO_ROOT, "bin/pdf-forge.ts"),
        join(sourceRoot, "bin/pdf-forge.ts")
      );
      await mkdir(join(sourceRoot, "scripts"), { recursive: true });
      await cp(
        join(REPO_ROOT, "scripts/render-pdf.ts"),
        join(sourceRoot, "scripts/render-pdf.ts")
      );
      await cp(
        join(REPO_ROOT, "skills/pdf-forge"),
        join(sourceRoot, "skills/pdf-forge"),
        { recursive: true }
      );
      const designSystem = join(
        sourceRoot,
        "skills/pdf-forge/references/design-system.md"
      );
      await writeFile(
        designSystem,
        `${await readFile(designSystem, "utf-8")}\nDISTRIBUTED_SOURCE_MARKER\n`,
        "utf-8"
      );
      await symlink(join(REPO_ROOT, "node_modules"), join(sourceRoot, "node_modules"));
      expect(await readFile(join(sourceRoot, "bin/pdf-forge.ts"), "utf-8")).toContain(
        "discoverPackageRoot"
      );
      expect(
        await readFile(join(sourceRoot, "scripts/render-pdf.ts"), "utf-8")
      ).toContain("renderPages");

      const moduleUrl = `${pathToFileURL(
        join(sourceRoot, "src/mcp/server.ts")
      ).href}?fixture=${Date.now()}`;
      const { createServer } = (await import(moduleUrl)) as {
        createServer: () => Promise<import("@modelcontextprotocol/sdk/server/mcp.js").McpServer>;
      };
      const server = await createServer();
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({ name: "source-probe", version: "1.0.0" });
      await client.connect(clientTransport);

      const result = await client.readResource({
        uri: "pdf-forge://design-system",
      });
      expect(result.contents[0]?.text).toContain("DISTRIBUTED_SOURCE_MARKER");
      expect(client.getServerVersion()?.version).toBe("9.8.7");
      expect(client.getServerVersion()?.version).not.toBe("0.0.0");

      await client.close();
      await server.close();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 60_000);
});
