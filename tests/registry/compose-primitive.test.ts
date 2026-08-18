import { afterEach, describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  composeDocumentPage,
  composeDocumentPageWithMetadata,
  composePrimitivePage,
} from "../../src/registry/compose";
import { parseDocumentManifest } from "../../src/registry/document-manifest";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const temporaryRoots: string[] = [];

async function packageRootWithMetricTemplate(
  template: string,
  schema?: Readonly<Record<string, unknown>>
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-compose-"));
  temporaryRoots.push(root);
  const registryRoot = join(root, "assets/registry");
  const templatePath = join(
    registryRoot,
    "primitives/metric-card/component.html"
  );
  const schemaPath = join(registryRoot, "primitives/metric-card/schema.json");
  const themePath = join(registryRoot, "themes/ivory-editorial.json");

  await Promise.all([
    mkdir(dirname(templatePath), { recursive: true }),
    mkdir(dirname(themePath), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      join(registryRoot, "registry.yaml"),
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
`,
      "utf-8"
    ),
    writeFile(templatePath, template, "utf-8"),
    schema === undefined
      ? copyFile(
          join(
            packageRoot,
            "assets/registry/primitives/metric-card/schema.json"
          ),
          schemaPath
        )
      : writeFile(schemaPath, JSON.stringify(schema), "utf-8"),
    copyFile(
      join(packageRoot, "assets/registry/themes/ivory-editorial.json"),
      themePath
    ),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

function metricCardManifest(props?: unknown) {
  return parseDocumentManifest({
    schemaVersion: "1",
    documentId: "quarterly-report",
    format: "docs",
    theme: "ivory-editorial",
    pages: [
      {
        id: "revenue-card",
        selection: { kind: "primitive", id: "metric-card" },
        props:
          props ??
          {
            label: '<script>alert("metric")</script>',
            value: "Revenue & profit",
            trend: {
              direction: "up",
              value: "+12% <unsafe>",
              label: 'vs. "quarter\'s" result',
            },
          },
      },
    ],
  });
}

function dataTableManifest(rows: readonly unknown[]) {
  return parseDocumentManifest({
    schemaVersion: "1",
    documentId: "people-report",
    format: "slides",
    theme: "ivory-editorial",
    pages: [
      {
        id: "people-table",
        selection: { kind: "primitive", id: "data-table" },
        props: {
          columns: [
            { key: "name", label: "Name <unsafe>", align: "left" },
            { key: "status", label: "Status", align: "center" },
            { key: "amount", label: "Amount", align: "right" },
          ],
          rows,
        },
      },
    ],
  });
}

describe("composePrimitivePage", () => {
  test("composes a deterministic, escaped, themed, self-contained metric-card document", async () => {
    const manifest = metricCardManifest();
    const page = manifest.pages[0];

    const first = await composePrimitivePage(manifest, page, packageRoot);
    const second = await composePrimitivePage(manifest, page, packageRoot);

    expect(first).toBe(second);
    expect(first).toStartWith("<!doctype html>\n<html lang=\"en\">\n<head>\n");
    expect(first).toContain('<meta charset="utf-8">');
    expect(first).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">'
    );
    expect(first).toContain("<title>quarterly-report — revenue-card</title>");
    expect(first).toContain(":root {\n  --color-background: #F7F3EA;");
    expect(first).toContain("  --radius-card: 12px;\n}");
    expect(first).toContain('class="w-[210mm] min-h-[297mm]"');
    expect(first).toContain('data-registry-entry="metric-card"');
    expect(first).toContain(
      "&lt;script&gt;alert(&quot;metric&quot;)&lt;/script&gt;"
    );
    expect(first).toContain("Revenue &amp; profit");
    expect(first).toContain("+12% &lt;unsafe&gt;");
    expect(first).toContain("vs. &quot;quarter&#39;s&quot; result");
    expect(first).not.toContain('<script>alert("metric")</script>');
    expect(first).not.toContain("{{");
    expect(first).toEndWith("\n</body>\n</html>\n");
  });

  test("returns exact immutable provenance metadata for a primitive composition without changing the legacy HTML API", async () => {
    const manifest = metricCardManifest();
    const page = manifest.pages[0];

    const composition = await composeDocumentPageWithMetadata(
      manifest,
      page,
      packageRoot
    );

    expect(composition.html).toBe(
      await composeDocumentPage(manifest, page, packageRoot)
    );
    expect(composition.componentIds).toEqual(["metric-card"]);
    expect(Object.isFrozen(composition)).toBe(true);
    expect(Object.isFrozen(composition.componentIds)).toBe(true);
  });

  test("omits the optional metric trend without leaving compiler syntax", async () => {
    const manifest = metricCardManifest({ label: "Revenue", value: "$1.2M" });

    const html = await composePrimitivePage(
      manifest,
      manifest.pages[0],
      packageRoot
    );

    expect(html).toContain("Revenue");
    expect(html).toContain("$1.2M");
    expect(html).not.toContain('<div\n    class="metric-card__trend"');
    expect(html).not.toContain("data-pdf-forge-");
    expect(html).not.toContain("{{");
  });

  test("rejects invalid props with selected schema file, schemaPath, and dataPath", async () => {
    const manifest = metricCardManifest({ label: "Revenue" });
    let caught: unknown;

    try {
      await composePrimitivePage(manifest, manifest.pages[0], packageRoot);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    if (!(caught instanceof Error)) {
      throw new Error("Expected primitive composition to throw an Error.");
    }
    expect(caught.message).toContain(
      `schema file "${join(packageRoot, "assets/registry/primitives/metric-card/schema.json")}"`
    );
    expect(caught.message).toContain('schemaPath "#/required"');
    expect(caught.message).toContain('dataPath "$.value"');
  });

  test("applies sibling constraints alongside local $ref definitions", async () => {
    const root = await packageRootWithMetricTemplate(
      "<article>{{escape:label}} {{escape:value}}</article>",
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $defs: {
          NonEmptyString: { type: "string", minLength: 1 },
        },
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: {
          label: {
            $ref: "#/$defs/NonEmptyString",
            pattern: "^Allowed label$",
          },
          value: { $ref: "#/$defs/NonEmptyString" },
        },
      }
    );
    const rejected = metricCardManifest({
      label: "Blocked label",
      value: "$1.2M",
    });
    const accepted = metricCardManifest({
      label: "Allowed label",
      value: "$1.2M",
    });

    await expect(
      composePrimitivePage(rejected, rejected.pages[0], root)
    ).rejects.toThrow('schemaPath "#/properties/label/pattern"');
    await expect(
      composePrimitivePage(accepted, accepted.pages[0], root)
    ).resolves.toContain("Allowed label");
  });

  test("rejects block pages before registry composition", async () => {
    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "quarterly-report",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "executive-report",
          selection: { kind: "block", id: "executive-report" },
          props: {},
        },
      ],
    });

    await expect(
      composePrimitivePage(manifest, manifest.pages[0], packageRoot)
    ).rejects.toThrow(
      'Registry block composition is not supported by composePrimitivePage: "executive-report".'
    );
  });

  test("rejects unknown and unresolved placeholders instead of substituting empty values", async () => {
    const manifest = metricCardManifest({ label: "Revenue", value: "$1.2M" });
    const unknownRoot = await packageRootWithMetricTemplate(
      "<article>{{escape:label}} {{escape:value}} {{escape:unknown}}</article>"
    );
    const unresolvedRoot = await packageRootWithMetricTemplate(
      "<article>{{escape:label}} {{escape:value}} {{escape:trend.label}}</article>"
    );

    await expect(
      composePrimitivePage(manifest, manifest.pages[0], unknownRoot)
    ).rejects.toThrow(
      'Unknown placeholder "{{escape:unknown}}" in registry template for "metric-card".'
    );
    await expect(
      composePrimitivePage(manifest, manifest.pages[0], unresolvedRoot)
    ).rejects.toThrow(
      'Metric-card placeholder "trend.label" could not be resolved to a string.'
    );
  });

  test("rejects executable or network-capable template content", async () => {
    const manifest = metricCardManifest({ label: "Revenue", value: "$1.2M" });
    const hostileFragments = [
      "<script>alert(1)</script>",
      "<style>.metric { background: url(https://example.com/a.png); }</style>",
      '<meta http-equiv="refresh" content="0; https://example.com/next">',
      '<video poster="https://example.com/poster.png"></video>',
      '<table background="https://example.com/background.png"></table>',
      "<audio></audio>",
      "<picture></picture>",
      "<svg><image /></svg>",
      "<svg><use /></svg>",
      "<svg><feImage /></svg>",
      '<style>.metric { background-image: image-set("https://example.com/a.png" 1x); }</style>',
      '<style>.metric { background-image: -webkit-image-set("https://example.com/a.png" 1x); }</style>',
      String.raw`<style>.metric { background: u\72l("http://127.0.0.1/pixel.png"); }</style>`,
      String.raw`<style>.metric { background: u\5c 72l("http://127.0.0.1/pixel.png"); }</style>`,
    ];

    for (const hostileFragment of hostileFragments) {
      const hostileRoot = await packageRootWithMetricTemplate(
        `<article>{{escape:label}} {{escape:value}}</article>${hostileFragment}`
      );
      await expect(
        composePrimitivePage(manifest, manifest.pages[0], hostileRoot)
      ).rejects.toThrow("Unsafe template content");
    }
  });

  test("renders data-table columns, rows, cells, alignment, and nulls in input order", async () => {
    const manifest = dataTableManifest([
      { cells: ["<Ada & Co>", null, 42] },
      { cells: ["Grace", true, -5.25] },
    ]);

    const html = await composePrimitivePage(
      manifest,
      manifest.pages[0],
      packageRoot
    );

    const nameHeading = html.indexOf("Name &lt;unsafe&gt;");
    const statusHeading = html.indexOf(">Status</th>");
    const amountHeading = html.indexOf(">Amount</th>");
    const adaCell = html.indexOf("&lt;Ada &amp; Co&gt;");
    const nullCell = html.indexOf(">—</td>");
    const fortyTwoCell = html.indexOf(">42</td>");
    const graceCell = html.indexOf(">Grace</td>");
    const booleanCell = html.indexOf(">true</td>");
    const negativeCell = html.indexOf(">-5.25</td>");

    expect(nameHeading).toBeGreaterThan(-1);
    expect(statusHeading).toBeGreaterThan(nameHeading);
    expect(amountHeading).toBeGreaterThan(statusHeading);
    expect(adaCell).toBeGreaterThan(amountHeading);
    expect(nullCell).toBeGreaterThan(adaCell);
    expect(fortyTwoCell).toBeGreaterThan(nullCell);
    expect(graceCell).toBeGreaterThan(fortyTwoCell);
    expect(booleanCell).toBeGreaterThan(graceCell);
    expect(negativeCell).toBeGreaterThan(booleanCell);
    expect(html).toContain('data-column-key="name"');
    expect(html).toContain('data-column-align="center"');
    expect(html).toContain('data-column-align="right"');
    expect(html).toContain('class="w-[1920px] h-[1080px]"');
    expect(html).not.toContain("No data available.");
    expect(html).not.toContain("data-pdf-forge-");
    expect(html).not.toContain("{{");
  });

  test("keeps JavaScript replacement tokens literal in validated table data", async () => {
    const replacementTokens = "$& $1 $$ $` $'";
    const manifest = parseDocumentManifest({
      schemaVersion: "1",
      documentId: "replacement-token-table",
      format: "docs",
      theme: "ivory-editorial",
      pages: [
        {
          id: "replacement-token-table",
          selection: { kind: "primitive", id: "data-table" },
          props: {
            columns: [
              {
                key: "replacement-token",
                label: replacementTokens,
                align: "left",
              },
            ],
            rows: [{ cells: [replacementTokens] }],
          },
        },
      ],
    });

    const html = await composePrimitivePage(
      manifest,
      manifest.pages[0],
      packageRoot
    );
    const escapedTokens = "$&amp; $1 $$ $` $&#39;";

    expect(html).toContain('data-column-key="replacement-token"');
    expect(html).toContain(`>${escapedTokens}</th>`);
    expect(html).toContain(`>${escapedTokens}</td>`);
  });

  test("renders the data-table empty state with deterministic column span", async () => {
    const manifest = dataTableManifest([]);

    const html = await composePrimitivePage(
      manifest,
      manifest.pages[0],
      packageRoot
    );

    expect(html).toContain("No data available.");
    expect(html).toContain('class="data-table__empty" colspan="3"');
    expect(html).not.toContain('class="data-table__row"');
    expect(html).not.toContain("data-pdf-forge-");
    expect(html).not.toContain("{{");
  });
});
