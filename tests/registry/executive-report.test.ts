import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";
import { composePrimitivePage } from "../../src/registry/compose";
import { parseDocumentManifest } from "../../src/registry/document-manifest";
import { loadRegistry } from "../../src/registry/loader";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const blockRoot = join(
  packageRoot,
  "assets/registry/blocks/executive-report"
);

const stringPropertySchema = z.strictObject({
  type: z.literal("string"),
  minLength: z.number().int().nonnegative(),
});
const objectPropertySchema = z.strictObject({
  type: z.literal("object"),
});
const blockPropsSchema = z.strictObject({
  type: z.literal("object"),
  additionalProperties: z.literal(false),
  required: z.tuple([
    z.literal("title"),
    z.literal("summary"),
    z.literal("metrics"),
    z.literal("table"),
    z.literal("recommendations"),
  ]),
  properties: z.strictObject({
    title: stringPropertySchema,
    summary: stringPropertySchema,
    metrics: z.strictObject({
      type: z.literal("array"),
      minItems: z.number().int().nonnegative(),
      maxItems: z.number().int().positive(),
      items: objectPropertySchema,
    }),
    table: objectPropertySchema,
    recommendations: z.strictObject({
      type: z.literal("array"),
      minItems: z.number().int().nonnegative(),
      maxItems: z.number().int().positive(),
      items: stringPropertySchema,
    }),
  }),
});
const textSectionSchema = z.strictObject({
  source: z.string().min(1),
  slot: z.string().min(1),
  repeat: z.boolean(),
});
const primitiveReferenceSchema = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
  slot: z.string().min(1),
  repeat: z.boolean(),
});
const blockDefinitionSchema = z.strictObject({
  version: z.literal("1"),
  schema: blockPropsSchema,
  sections: z.strictObject({
    title: textSectionSchema,
    summary: textSectionSchema,
    recommendations: textSectionSchema,
  }),
  primitives: z.strictObject({
    metrics: primitiveReferenceSchema,
    table: primitiveReferenceSchema,
  }),
});

type BlockDefinition = z.infer<typeof blockDefinitionSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesBlockSchema(schema: BlockDefinition["schema"], value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  if (
    schema.required.some(
      (property) => !Object.prototype.hasOwnProperty.call(value, property)
    )
  ) {
    return false;
  }
  if (
    schema.additionalProperties === false &&
    Object.keys(value).some((property) => !(property in schema.properties))
  ) {
    return false;
  }

  for (const property of ["title", "summary"] as const) {
    const propertySchema = schema.properties[property];
    const propertyValue = value[property];
    if (
      typeof propertyValue !== "string" ||
      propertyValue.length < propertySchema.minLength
    ) {
      return false;
    }
  }

  const metrics = value.metrics;
  if (
    !Array.isArray(metrics) ||
    metrics.length < schema.properties.metrics.minItems ||
    metrics.length > schema.properties.metrics.maxItems ||
    !metrics.every(isRecord)
  ) {
    return false;
  }
  if (!isRecord(value.table)) {
    return false;
  }

  const recommendations = value.recommendations;
  return (
    Array.isArray(recommendations) &&
    recommendations.length >= schema.properties.recommendations.minItems &&
    recommendations.length <= schema.properties.recommendations.maxItems &&
    recommendations.every(
      (recommendation) =>
        typeof recommendation === "string" &&
        recommendation.length >=
          schema.properties.recommendations.items.minLength
    )
  );
}

async function readDefinition(): Promise<{
  readonly raw: string;
  readonly parsed: BlockDefinition;
}> {
  const raw = await readFile(join(blockRoot, "block.yaml"), "utf-8");
  const document: unknown = loadYaml(raw);
  return { raw, parsed: blockDefinitionSchema.parse(document) };
}

async function readExample(): Promise<unknown> {
  const raw = await readFile(join(blockRoot, "example.json"), "utf-8");
  const example: unknown = JSON.parse(raw);
  return example;
}

async function readTemplate(): Promise<string> {
  return readFile(join(blockRoot, "template.html"), "utf-8");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function extractPrimitiveFragment(html: string): string {
  const body = html.match(/<body\b[^>]*>\n([\s\S]*)\n<\/body>/u)?.[1];
  if (body === undefined) {
    throw new Error("Synthetic primitive page has no body fragment.");
  }
  return body.trim();
}

async function composePrimitiveFragment(
  primitiveId: string,
  props: unknown,
  pageId: string
): Promise<string> {
  const manifest = parseDocumentManifest({
    schemaVersion: "1",
    documentId: "executive-report-example",
    format: "docs",
    theme: "ivory-editorial",
    pages: [
      {
        id: pageId,
        selection: { kind: "primitive", id: primitiveId },
        props,
      },
    ],
  });
  const html = await composePrimitivePage(manifest, manifest.pages[0], packageRoot);
  return extractPrimitiveFragment(html);
}

function replaceEmptySlot(template: string, slot: "metrics" | "table", html: string): string {
  const marker = `<div class="executive-report__${slot}" data-pdf-forge-slot="${slot}"></div>`;
  if (!template.includes(marker)) {
    throw new Error(`Executive-report template is missing the explicit "${slot}" slot.`);
  }
  return template.replace(
    marker,
    `<div class="executive-report__${slot}" data-pdf-forge-slot="${slot}">\n${html}\n</div>`
  );
}

async function composeBlockInMemory(
  definition: BlockDefinition,
  template: string,
  example: unknown
): Promise<string> {
  if (!matchesBlockSchema(definition.schema, example) || !isRecord(example)) {
    throw new Error("Executive-report example does not match its block schema.");
  }
  const metrics = example.metrics;
  const recommendations = example.recommendations;
  if (!Array.isArray(metrics) || !Array.isArray(recommendations)) {
    throw new Error("Validated executive-report collections are unavailable.");
  }

  const metricFragments = await Promise.all(
    metrics.map((metric, index) =>
      composePrimitiveFragment(
        definition.primitives.metrics.id,
        metric,
        `metric-${index + 1}`
      )
    )
  );
  const tableFragment = await composePrimitiveFragment(
    definition.primitives.table.id,
    example.table,
    "report-table"
  );

  const recommendationItem =
    '<li class="executive-report__recommendation" data-pdf-forge-each="recommendations">{{escape:recommendations[]}}</li>';
  if (!template.includes(recommendationItem)) {
    throw new Error("Executive-report template is missing its recommendations iteration.");
  }
  const renderedRecommendations = recommendations
    .map((recommendation) => {
      if (typeof recommendation !== "string") {
        throw new Error("Validated recommendation is not a string.");
      }
      return `<li class="executive-report__recommendation">${escapeHtml(recommendation)}</li>`;
    })
    .join("\n");

  const title = example.title;
  const summary = example.summary;
  if (typeof title !== "string" || typeof summary !== "string") {
    throw new Error("Validated executive-report text is unavailable.");
  }

  let output = template
    .replace("{{escape:title}}", escapeHtml(title))
    .replace("{{escape:summary}}", escapeHtml(summary))
    .replace(recommendationItem, renderedRecommendations);
  output = replaceEmptySlot(output, "metrics", metricFragments.join("\n"));
  output = replaceEmptySlot(output, "table", tableFragment);
  return output;
}

describe("executive-report block", () => {
  test("is registered as a docs/slides block with canonical YAML and template assets", async () => {
    const registry = await loadRegistry(packageRoot);
    const executiveReport = registry.entries.find(
      (entry) => entry.id === "executive-report"
    );

    expect(executiveReport).toEqual({
      id: "executive-report",
      kind: "block",
      version: "1.0.0",
      template: "blocks/executive-report/template.html",
      schema: "blocks/executive-report/block.yaml",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
    });
  });

  test("declares strict text sections and primitive references without inline HTML", async () => {
    const [{ raw, parsed: definition }, registry] = await Promise.all([
      readDefinition(),
      loadRegistry(packageRoot),
    ]);

    expect(definition.version).toBe("1");
    expect(definition.sections).toEqual({
      title: { source: "title", slot: "title", repeat: false },
      summary: { source: "summary", slot: "summary", repeat: false },
      recommendations: {
        source: "recommendations",
        slot: "recommendations",
        repeat: true,
      },
    });
    expect(definition.primitives).toEqual({
      metrics: {
        id: "metric-card",
        source: "metrics",
        slot: "metrics",
        repeat: true,
      },
      table: {
        id: "data-table",
        source: "table",
        slot: "table",
        repeat: false,
      },
    });
    expect(raw).not.toMatch(/<\/?[a-z][^>]*>/iu);

    for (const reference of Object.values(definition.primitives)) {
      expect(
        registry.entries.some(
          (entry) => entry.id === reference.id && entry.kind === "primitive"
        )
      ).toBe(true);
    }
  });

  test("ships a block-valid example composed through the referenced primitive validators", async () => {
    const [definitionResult, template, example] = await Promise.all([
      readDefinition(),
      readTemplate(),
      readExample(),
    ]);

    expect(matchesBlockSchema(definitionResult.parsed.schema, example)).toBe(true);
    const html = await composeBlockInMemory(
      definitionResult.parsed,
      template,
      example
    );

    expect(html).toContain("Q2 2026 Executive Report");
    expect(html).toContain(
      "Revenue growth accelerated while retention remained above target."
    );
    expect(html.match(/class="metric-card"/gu)).toHaveLength(2);
    expect(html).toContain('class="data-table"');
    expect(html).toContain("Prioritize enterprise expansion in the next quarter.");
    expect(html).toContain("Protect onboarding capacity as volume grows.");
    expect(html).not.toContain("{{");
  });

  test("surfaces invalid metrics at the metric-card primitive schemaPath", async () => {
    const [definitionResult, template, example] = await Promise.all([
      readDefinition(),
      readTemplate(),
      readExample(),
    ]);
    if (!isRecord(example)) {
      throw new Error("Expected the canonical block example to be an object.");
    }
    const invalidExample = { ...example, metrics: [{ label: "Revenue" }] };

    await expect(
      composeBlockInMemory(definitionResult.parsed, template, invalidExample)
    ).rejects.toThrow(
      /metric-card\/schema\.json[^\n]*schemaPath "#\/required"[^\n]*required property is missing/u
    );
  });

  test("surfaces invalid tables at the data-table primitive schemaPath", async () => {
    const [definitionResult, template, example] = await Promise.all([
      readDefinition(),
      readTemplate(),
      readExample(),
    ]);
    if (!isRecord(example) || !isRecord(example.table)) {
      throw new Error("Expected the canonical block example to contain a table.");
    }
    const rows = Array.from({ length: 13 }, (_, index) => ({
      cells: [`Q${index + 1}`, index + 1, `${index + 1}%`],
    }));
    const invalidExample = {
      ...example,
      table: { ...example.table, rows },
    };

    await expect(
      composeBlockInMemory(definitionResult.parsed, template, invalidExample)
    ).rejects.toThrow(
      /data-table\/schema\.json[^\n]*schemaPath "#\/properties\/rows\/maxItems"[^\n]*violates maxItems 12/u
    );
  });

  test("uses escaped placeholders and explicit slots in a network-free fragment", async () => {
    const template = await readTemplate();
    const placeholders = template.match(/\{\{[^{}]+\}\}/gu) ?? [];

    expect(placeholders).toEqual([
      "{{escape:title}}",
      "{{escape:summary}}",
      "{{escape:recommendations[]}}",
    ]);
    for (const slot of [
      "title",
      "summary",
      "metrics",
      "table",
      "recommendations",
    ]) {
      expect(template).toContain(`data-pdf-forge-slot="${slot}"`);
    }
    expect(template).not.toContain("{{{");
    expect(template).not.toMatch(/\{\{(?:raw|html):/iu);
    expect(template).not.toMatch(
      /<\/?(?:script|iframe|object|embed|link|base|form)\b|\bon[a-z]+\s*=|\b(?:src|srcset|href|action)\s*=|javascript\s*:|@import\b|url\s*\(/iu
    );
  });
});
