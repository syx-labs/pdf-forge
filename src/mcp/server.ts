import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { dirname, resolve, join } from "node:path";
import { mkdir, readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
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

const ExplicitPathSchema = z
  .string()
  .min(1)
  .max(4_096)
  .refine((path: string) => path.trim().length > 0, {
    message: "Path must not be blank.",
  })
  .refine((path: string) => !path.includes("\0"), {
    message: "Path must not contain NUL bytes.",
  });

const ComposePdfInputSchema = z.strictObject({
  manifest: z.unknown().describe("Governed document manifest to compose"),
  data: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("embedded"),
      snapshot: z.unknown(),
    }),
    z.strictObject({
      kind: z.literal("static-json"),
      filePath: ExplicitPathSchema,
    }),
  ]),
  outputPath: ExplicitPathSchema.refine((path: string) => path.endsWith(".pdf"), {
    message: "Output path must end with .pdf.",
  }),
});

type ComposePdfInput = z.infer<typeof ComposePdfInputSchema>;
type ComposeErrorCode =
  | "INVALID_MANIFEST"
  | "INVALID_SNAPSHOT"
  | "SNAPSHOT_LIMIT_EXCEEDED"
  | "BINDING_FAILED"
  | "COMPOSITION_FAILED";

class ComposePdfError extends Error {
  readonly code: ComposeErrorCode;
  readonly issues: readonly ManifestIssue[] | undefined;

  constructor(
    code: ComposeErrorCode,
    message: string,
    issues?: readonly ManifestIssue[]
  ) {
    super(message);
    this.name = "ComposePdfError";
    this.code = code;
    this.issues = issues;
  }
}

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

function manifestIssuesFromZod(error: z.ZodError): ManifestIssue[] {
  return sortManifestIssues(
    error.issues.map((issue: z.core.$ZodIssue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
    }))
  );
}

function validateManifestAgainstRegistry(
  manifest: DocumentManifest,
  registry: LoadedRegistry
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  for (const [index, page] of manifest.pages.entries()) {
    const path = `$.pages[${index}].selection.id`;
    const component = registry.entries.find(
      (entry) => entry.id === page.selection.id
    );
    if (component === undefined) {
      issues.push({
        path,
        message: "Selected component is not registered.",
      });
      continue;
    }
    if (component.kind !== page.selection.kind) {
      issues.push({
        path,
        message: "Selected component kind does not match the registry.",
      });
    }
    if (!component.formats.includes(manifest.format)) {
      issues.push({
        path,
        message: "Selected component does not support the manifest format.",
      });
    }
    if (!component.themes.includes(manifest.theme)) {
      issues.push({
        path,
        message: "Selected component does not support the manifest theme.",
      });
    }
  }
  return sortManifestIssues(issues);
}

function validateComposeManifestInvariants(
  manifest: DocumentManifest
): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  if (manifest.pages.length !== 1) {
    issues.push({
      path: "$.pages",
      message: "compose_pdf v1 requires exactly one page.",
    });
    return issues;
  }

  const page = manifest.pages[0];
  if (page === undefined) {
    return issues;
  }
  if (
    page.selection.kind !== "block" ||
    page.selection.id !== "executive-report"
  ) {
    issues.push({
      path: "$.pages[0].selection",
      message: "compose_pdf v1 requires the executive-report block.",
    });
  }
  if (!isRecord(page.props) || Object.keys(page.props).length !== 0) {
    issues.push({
      path: "$.pages[0].props",
      message: "compose_pdf supplies governed props; manifest props must be empty.",
    });
  }
  if (manifest.snapshotRef === undefined) {
    issues.push({
      path: "$.snapshotRef",
      message: "compose_pdf requires a snapshot reference.",
    });
  }
  return sortManifestIssues(issues);
}

function isSnapshotLimitError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Encoded snapshot exceeds ") ||
      error.message.includes(" exceeds maximum size of ") ||
      error.message.includes('"code": "too_big"'))
  );
}

async function loadComposeSnapshot(data: ComposePdfInput["data"]) {
  try {
    if (data.kind === "embedded") {
      const { parseDataSnapshot } = await import("../data/schemas.js");
      return parseDataSnapshot(data.snapshot);
    }

    const [{ DataProviderRegistry }, { StaticJsonProvider }] = await Promise.all([
      import("../data/provider-registry.js"),
      import("../data/providers/static-json.js"),
    ]);
    const providers = new DataProviderRegistry();
    providers.register(new StaticJsonProvider());
    const abortController = new AbortController();
    return await providers.load(
      "static-json",
      { filePath: resolve(data.filePath) },
      { signal: abortController.signal }
    );
  } catch (error) {
    if (isSnapshotLimitError(error)) {
      throw new ComposePdfError(
        "SNAPSHOT_LIMIT_EXCEEDED",
        "Snapshot exceeds the configured compose_pdf limits."
      );
    }
    throw new ComposePdfError(
      "INVALID_SNAPSHOT",
      "Snapshot failed governed data validation."
    );
  }
}

function composeErrorResult(error: ComposePdfError): CallToolResult {
  return jsonTextResult(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.issues === undefined ? {} : { issues: error.issues }),
      },
    },
    true
  );
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
    "compose_pdf",
    {
      description:
        "Compose one governed executive-report manifest from a bounded data snapshot and return an auditable PDF receipt.",
      inputSchema: ComposePdfInputSchema,
    },
    async ({ manifest: manifestInput, data, outputPath }: ComposePdfInput) => {
      try {
        let manifest: DocumentManifest;
        try {
          manifest = await parseDocumentManifestForMcp(manifestInput);
        } catch (error) {
          if (error instanceof z.ZodError) {
            throw new ComposePdfError(
              "INVALID_MANIFEST",
              "Manifest failed semantic validation.",
              manifestIssuesFromZod(error)
            );
          }
          throw error;
        }

        const registry = await loadCanonicalRegistry();
        const registryIssues = validateManifestAgainstRegistry(
          manifest,
          registry
        );
        const invariantIssues = validateComposeManifestInvariants(manifest);
        const manifestIssues = sortManifestIssues([
          ...registryIssues,
          ...invariantIssues,
        ]);
        if (manifestIssues.length > 0) {
          throw new ComposePdfError(
            "INVALID_MANIFEST",
            "Manifest is not eligible for compose_pdf v1.",
            manifestIssues
          );
        }

        const snapshot = await loadComposeSnapshot(data);
        if (manifest.snapshotRef !== snapshot.snapshotId) {
          throw new ComposePdfError(
            "INVALID_MANIFEST",
            "Manifest snapshot reference does not match the governed snapshot.",
            [
              {
                path: "$.snapshotRef",
                message: "Snapshot reference mismatch.",
              },
            ]
          );
        }

        let redacted: typeof snapshot;
        let props: Awaited<
          ReturnType<
            typeof import("../data/bindings/executive-report.js").bindExecutiveReport
          >
        >;
        try {
          const [{ redactDataSnapshot }, { bindExecutiveReport }] =
            await Promise.all([
              import("../data/redact.js"),
              import("../data/bindings/executive-report.js"),
            ]);
          redacted = redactDataSnapshot(snapshot, {
            mode: "allow",
            columns: ["region", "revenue", "target", "recommendation"],
          });
          props = bindExecutiveReport(redacted);
        } catch {
          throw new ComposePdfError(
            "BINDING_FAILED",
            "Snapshot could not be bound to the executive-report contract."
          );
        }

        const sourcePage = manifest.pages[0];
        if (sourcePage === undefined) {
          throw new ComposePdfError(
            "INVALID_MANIFEST",
            "Manifest is not eligible for compose_pdf v1."
          );
        }
        const effectiveManifest = await parseDocumentManifestForMcp({
          ...manifest,
          pages: [{ ...sourcePage, props }],
        });
        const effectivePage = effectiveManifest.pages[0];
        if (effectivePage === undefined) {
          throw new ComposePdfError(
            "COMPOSITION_FAILED",
            "Effective manifest could not be composed."
          );
        }
        let composition: Readonly<{
          html: string;
          componentIds: readonly string[];
        }>;
        try {
          const { composeDocumentPageWithMetadata } = await import(
            "../registry/compose.js"
          );
          composition = await composeDocumentPageWithMetadata(
            effectiveManifest,
            effectivePage,
            packageRoot
          );
        } catch {
          throw new ComposePdfError(
            "COMPOSITION_FAILED",
            "Effective manifest could not be composed."
          );
        }

        const tempDir = await mkdtemp(
          join(tmpdir(), "pdf-forge-compose-mcp-")
        );
        try {
          const pagesDir = join(tempDir, "pages");
          const renderDir = join(tempDir, "rendered");
          await mkdir(pagesDir, { recursive: true });
          await writeFile(
            join(pagesDir, "01-executive-report.html"),
            composition.html,
            "utf-8"
          );
          await renderPages({
            inputDir: pagesDir,
            outputDir: renderDir,
            format: effectiveManifest.format,
            scale: 1,
          });

          const finalPath = resolve(outputPath);
          await mkdir(dirname(finalPath), { recursive: true });
          const mergeResult = await mergePages({
            inputDir: renderDir,
            outputPath: finalPath,
          });
          const receiptRegistry = await loadCanonicalRegistry();
          const { buildPdfBuildReceipt } = await import(
            "../registry/receipt.js"
          );
          const receipt = await buildPdfBuildReceipt({
            manifest: effectiveManifest,
            registry: receiptRegistry,
            componentIds: composition.componentIds,
            snapshot: redacted,
            mergeResult,
            warnings: [],
            createdAt: new Date().toISOString(),
          });
          return jsonTextResult({
            ok: true,
            path: mergeResult.path,
            receipt,
          });
        } finally {
          await rm(tempDir, { recursive: true, force: true }).catch(() => {});
        }
      } catch (error) {
        if (error instanceof ComposePdfError) {
          return composeErrorResult(error);
        }
        return composeErrorResult(
          new ComposePdfError(
            "COMPOSITION_FAILED",
            "Structured PDF composition failed."
          )
        );
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
        const registryIssues = validateManifestAgainstRegistry(manifest, registry);
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

