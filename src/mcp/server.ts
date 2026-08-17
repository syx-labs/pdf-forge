import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { resolve, join } from "node:path";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { discoverPackageRoot } from "../core/package-root.js";
import { renderPages } from "../core/renderer.js";
import { mergePages } from "../core/merger.js";
import type { DocumentManifest } from "../registry/document-manifest.js";
import type { LoadedRegistry } from "../registry/loader.js";

const packageRootPromise = discoverPackageRoot(import.meta.url);

type JsonPrimitive = boolean | number | string | null;
type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type RegistryBridge = {
  loadRegistryForMcp(packageRoot: string): Promise<LoadedRegistry>;
  parseDocumentManifestForMcp(input: unknown): Promise<DocumentManifest>;
};

const SafeComponentIdSchema = z
  .string()
  .max(128)
  .regex(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/)
  .describe("Safe canonical component ID returned by list_pdf_components");

function jsonTextResult(
  value: JsonValue,
  isError = false
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    ...(isError ? { isError: true } : {}),
  };
}

type ManifestIssue = Readonly<{ path: string; message: string }>;

function sortManifestIssues(issues: readonly ManifestIssue[]): ManifestIssue[] {
  return [...issues].sort((left, right) => {
    if (left.path !== right.path) {
      return left.path < right.path ? -1 : 1;
    }
    if (left.message === right.message) {
      return 0;
    }
    return left.message < right.message ? -1 : 1;
  });
}

function formatIssuePath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === "number") {
      return `${formatted}[${segment}]`;
    }
    return `${formatted}.${String(segment)}`;
  }, "$");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRegistryBridge(value: unknown): value is RegistryBridge {
  return (
    isRecord(value) &&
    typeof value.loadRegistryForMcp === "function" &&
    typeof value.parseDocumentManifestForMcp === "function"
  );
}

async function importBuiltRegistryBridge(
  sourceImportError: unknown
): Promise<RegistryBridge> {
  const builtModuleUrl = new URL(
    "../../dist/src/mcp/server.js",
    import.meta.url
  ).href;
  let builtModule: unknown;
  try {
    builtModule = await import(builtModuleUrl);
  } catch {
    throw sourceImportError;
  }
  if (!isRegistryBridge(builtModule)) {
    throw sourceImportError;
  }
  return builtModule;
}

export async function loadRegistryForMcp(
  packageRoot: string
): Promise<LoadedRegistry> {
  let registryModule: typeof import("../registry/loader.js");
  try {
    registryModule = await import("../registry/loader.js");
  } catch (error) {
    const bridge = await importBuiltRegistryBridge(error);
    return bridge.loadRegistryForMcp(packageRoot);
  }
  return registryModule.loadRegistry(packageRoot);
}

export async function parseDocumentManifestForMcp(
  input: unknown
): Promise<DocumentManifest> {
  let manifestModule: typeof import("../registry/document-manifest.js");
  try {
    manifestModule = await import("../registry/document-manifest.js");
  } catch (error) {
    const bridge = await importBuiltRegistryBridge(error);
    return bridge.parseDocumentManifestForMcp(input);
  }
  return manifestModule.parseDocumentManifest(input);
}

async function readPackageVersion(packageRoot: string): Promise<string> {
  const raw = await readFile(join(packageRoot, "package.json"), "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const version = isRecord(parsed) ? parsed.version : undefined;
  if (typeof version !== "string" || version.length === 0 || version === "0.0.0") {
    throw new Error(`Invalid pdf-forge package version at "${packageRoot}".`);
  }
  return version;
}

const RESOURCE_MAP = {
  "pdf-forge://design-system": "skills/pdf-forge/references/design-system.md",
  "pdf-forge://templates/slides":
    "skills/pdf-forge/references/slide-layouts.md",
  "pdf-forge://templates/docs": "skills/pdf-forge/references/doc-layouts.md",
  "pdf-forge://color-palettes": "skills/pdf-forge/references/color-palettes.md",
  "pdf-forge://anti-patterns": "skills/pdf-forge/references/anti-patterns.md",
} satisfies Record<string, string>;

export async function createServer(): Promise<McpServer> {
  const packageRoot = await packageRootPromise;
  const version = await readPackageVersion(packageRoot);
  let registryPromise: ReturnType<typeof loadRegistryForMcp> | undefined;
  const loadCanonicalRegistry = (): ReturnType<typeof loadRegistryForMcp> => {
    registryPromise ??= loadRegistryForMcp(packageRoot);
    return registryPromise;
  };
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

  server.registerTool(
    "list_pdf_components",
    {
      description:
        "List the canonical PDF component registry for agent planning without exposing local filesystem paths.",
      inputSchema: z.strictObject({}),
    },
    async () => {
      const registry = await loadCanonicalRegistry();
      return jsonTextResult({
        ok: true,
        registryVersion: registry.version,
        components: registry.entries.map((entry) => ({
          id: entry.id,
          kind: entry.kind,
          version: entry.version,
          formats: [...entry.formats],
          themes: [...entry.themes],
        })),
      });
    }
  );

  server.registerTool(
    "inspect_pdf_component",
    {
      description:
        "Inspect one canonical PDF component, including its formats, themes, and registry-relative template and schema paths.",
      inputSchema: z.strictObject({ id: SafeComponentIdSchema }),
    },
    async ({ id }) => {
      const registry = await loadCanonicalRegistry();
      const component = registry.entries.find((entry) => entry.id === id);
      if (component === undefined) {
        return jsonTextResult(
          {
            ok: false,
            error: {
              code: "COMPONENT_NOT_FOUND",
              message: `PDF component "${id}" was not found.`,
              availableIds: registry.entries.map((entry) => entry.id),
            },
          },
          true
        );
      }

      return jsonTextResult({
        ok: true,
        component: {
          id: component.id,
          kind: component.kind,
          version: component.version,
          formats: [...component.formats],
          themes: [...component.themes],
          template: component.template,
          schema: component.schema,
        },
      });
    }
  );

  server.registerTool(
    "validate_pdf_manifest",
    {
      description:
        "Validate an unknown document manifest at the MCP boundary and return a minimal composition summary without props, snapshots, or raw input values.",
      inputSchema: z.strictObject({
        manifest: z.unknown().describe("Document manifest to validate"),
      }),
    },
    async ({ manifest: manifestInput }) => {
      try {
        const manifest = await parseDocumentManifestForMcp(manifestInput);
        const registry = await loadCanonicalRegistry();
        const registryIssues: ManifestIssue[] = [];
        for (const [index, page] of manifest.pages.entries()) {
          const path = `$.pages[${index}].selection.id`;
          const component = registry.entries.find(
            (entry) => entry.id === page.selection.id
          );
          if (component === undefined) {
            registryIssues.push({
              path,
              message: "Selected component is not registered.",
            });
            continue;
          }
          if (component.kind !== page.selection.kind) {
            registryIssues.push({
              path,
              message: "Selected component kind does not match the registry.",
            });
          }
          if (!component.formats.includes(manifest.format)) {
            registryIssues.push({
              path,
              message: "Selected component does not support the manifest format.",
            });
          }
          if (!component.themes.includes(manifest.theme)) {
            registryIssues.push({
              path,
              message: "Selected component does not support the manifest theme.",
            });
          }
        }
        if (registryIssues.length > 0) {
          return jsonTextResult(
            {
              ok: false,
              error: {
                code: "INVALID_MANIFEST",
                message: "Manifest failed registry validation.",
                issues: sortManifestIssues(registryIssues),
              },
            },
            true
          );
        }
        return jsonTextResult({
          ok: true,
          manifest: {
            schemaVersion: manifest.schemaVersion,
            documentId: manifest.documentId,
            format: manifest.format,
            theme: manifest.theme,
            pageCount: manifest.pages.length,
            pages: manifest.pages.map((page) => ({
              id: page.id,
              kind: page.selection.kind,
              componentId: page.selection.id,
            })),
          },
        });
      } catch (error) {
        if (!(error instanceof z.ZodError)) {
          throw error;
        }

        const issues = sortManifestIssues(
          error.issues.map((issue) => ({
            path: formatIssuePath(issue.path),
            message: issue.message,
          }))
        );

        return jsonTextResult(
          {
            ok: false,
            error: {
              code: "INVALID_MANIFEST",
              message: "Manifest failed semantic validation.",
              issues,
            },
          },
          true
        );
      }
    }
  );

  return server;
}

