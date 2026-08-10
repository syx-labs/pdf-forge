import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolve, join } from "node:path";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { discoverPackageRoot } from "../core/package-root.js";
import { renderPages } from "../core/renderer.js";
import { mergePages } from "../core/merger.js";

const packageRootPromise = discoverPackageRoot(import.meta.url);

async function readPackageVersion(packageRoot: string): Promise<string> {
  const raw = await readFile(join(packageRoot, "package.json"), "utf-8");
  const version = (JSON.parse(raw) as { version?: unknown }).version;
  if (typeof version !== "string" || version.length === 0 || version === "0.0.0") {
    throw new Error(`Invalid pdf-forge package version at "${packageRoot}".`);
  }
  return version;
}

const RESOURCE_MAP: Record<string, string> = {
  "pdf-forge://design-system": "skills/pdf-forge/references/design-system.md",
  "pdf-forge://templates/slides":
    "skills/pdf-forge/references/slide-layouts.md",
  "pdf-forge://templates/docs": "skills/pdf-forge/references/doc-layouts.md",
  "pdf-forge://color-palettes": "skills/pdf-forge/references/color-palettes.md",
  "pdf-forge://anti-patterns": "skills/pdf-forge/references/anti-patterns.md",
};

export async function createServer(): Promise<McpServer> {
  const packageRoot = await packageRootPromise;
  const version = await readPackageVersion(packageRoot);
  const server = new McpServer({
    name: "pdf-forge",
    version,
  });

  // Register resources
  for (const [uri, filePath] of Object.entries(RESOURCE_MAP)) {
    const name = uri.replace("pdf-forge://", "");
    server.resource(name, uri, async () => {
      const content = await readFile(join(packageRoot, filePath), "utf-8");
      return {
        contents: [{ uri, text: content, mimeType: "text/markdown" }],
      };
    });
  }

  // Register tool
  server.tool(
    "generate_pdf",
    {
      format: z
        .enum(["slides", "docs"])
        .describe(
          "Output format: 'slides' for 16:9 presentations, 'docs' for A4 documents"
        ),
      pages: z
        .array(z.string())
        .min(1)
        .describe(
          "Array of complete, self-contained HTML strings. Each string is one page/slide. " +
            "Read the pdf-forge://design-system and pdf-forge://templates/* resources for guidance."
        ),
      outputPath: z
        .string()
        .optional()
        .describe("Output PDF path. Default: ./output.pdf"),
      scale: z
        .number()
        .int()
        .min(1)
        .max(4)
        .optional()
        .describe(
          "Render scale factor. Default: 2 (HiDPI). Use 3 for print quality."
        ),
    },
    async ({ format, pages, outputPath, scale }) => {
      const tempDir = await mkdtemp(join(tmpdir(), "pdf-forge-"));

      try {
        for (let i = 0; i < pages.length; i++) {
          const filename = `${String(i + 1).padStart(2, "0")}-page.html`;
          await writeFile(join(tempDir, filename), pages[i], "utf-8");
        }

        const renderDir = join(tempDir, "rendered");
        await renderPages({
          inputDir: tempDir,
          outputDir: renderDir,
          format,
          scale,
        });

        const finalPath = resolve(outputPath ?? "./output.pdf");
        const result = await mergePages({
          inputDir: renderDir,
          outputPath: finalPath,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                path: result.path,
                pageCount: result.pageCount,
                fileSize: result.fileSize,
              }),
            },
          ],
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  );

  return server;
}

