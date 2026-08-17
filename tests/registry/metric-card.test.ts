import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../../src/registry/loader";

interface JsonSchema {
  readonly type?: "object" | "string";
  readonly const?: unknown;
  readonly minLength?: number;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly additionalProperties?: boolean;
  readonly oneOf?: readonly JsonSchema[];
}

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const primitiveRoot = join(
  packageRoot,
  "assets/registry/primitives/metric-card"
);

async function readJsonSchema(): Promise<JsonSchema> {
  const raw = await readFile(join(primitiveRoot, "schema.json"), "utf-8");
  return JSON.parse(raw);
}

async function readExample(): Promise<unknown> {
  const raw = await readFile(join(primitiveRoot, "example.json"), "utf-8");
  return JSON.parse(raw);
}

async function readTemplate(): Promise<string> {
  return readFile(join(primitiveRoot, "component.html"), "utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesJsonSchema(schema: JsonSchema, value: unknown): boolean {
  if (
    schema.oneOf !== undefined &&
    schema.oneOf.filter((candidate) => matchesJsonSchema(candidate, value))
      .length !== 1
  ) {
    return false;
  }

  if ("const" in schema && !Object.is(schema.const, value)) {
    return false;
  }

  if (schema.type === "string") {
    return (
      typeof value === "string" &&
      (schema.minLength === undefined || value.length >= schema.minLength)
    );
  }

  if (schema.type !== "object") {
    return true;
  }

  if (!isRecord(value)) {
    return false;
  }

  const properties = schema.properties ?? {};
  if (
    schema.required?.some(
      (property) => !Object.prototype.hasOwnProperty.call(value, property)
    )
  ) {
    return false;
  }

  if (
    schema.additionalProperties === false &&
    Object.keys(value).some((property) => !(property in properties))
  ) {
    return false;
  }

  return Object.entries(properties).every(
    ([property, propertySchema]) =>
      !(property in value) || matchesJsonSchema(propertySchema, value[property])
  );
}

const escapedPlaceholderPattern = /\{\{escape:([a-z]+(?:\.[a-z]+)*)\}\}/g;

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

function renderEscapedPlaceholders(
  template: string,
  values: ReadonlyMap<string, string>
): string {
  return template.replace(
    escapedPlaceholderPattern,
    (_placeholder, path: string) => escapeHtml(values.get(path) ?? "")
  );
}

describe("metric-card primitive", () => {
  test("is registered with its canonical assets and supported surfaces", async () => {
    const registry = await loadRegistry(packageRoot);
    const metricCard = registry.entries.find(
      (entry) => entry.id === "metric-card"
    );

    expect(metricCard).toEqual({
      id: "metric-card",
      kind: "primitive",
      version: "1.0.0",
      template: "primitives/metric-card/component.html",
      schema: "primitives/metric-card/schema.json",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
    });
  });

  test("requires exactly label and value at the root", async () => {
    const schema = await readJsonSchema();

    expect(
      matchesJsonSchema(schema, { label: "Revenue", value: "$1.2M" })
    ).toBe(true);
    expect(matchesJsonSchema(schema, { label: "Revenue" })).toBe(false);
    expect(matchesJsonSchema(schema, { value: "$1.2M" })).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        label: "Revenue",
        value: "$1.2M",
        color: "green",
      })
    ).toBe(false);
  });

  test("accepts trend only as a strict discriminated object", async () => {
    const schema = await readJsonSchema();
    const base = { label: "Revenue", value: "$1.2M" };

    for (const direction of ["up", "down", "neutral"] as const) {
      expect(
        matchesJsonSchema(schema, {
          ...base,
          trend: {
            direction,
            value: direction === "neutral" ? "0%" : "12%",
            label: "vs. previous quarter",
          },
        })
      ).toBe(true);
    }

    expect(
      matchesJsonSchema(schema, {
        ...base,
        trend: {
          direction: "sideways",
          value: "12%",
          label: "vs. previous quarter",
        },
      })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        ...base,
        trend: { direction: "up", value: "12%" },
      })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        ...base,
        trend: {
          direction: "up",
          value: "12%",
          label: "vs. previous quarter",
          icon: "arrow",
        },
      })
    ).toBe(false);
  });

  test("ships a schema-valid canonical example", async () => {
    const [schema, example] = await Promise.all([
      readJsonSchema(),
      readExample(),
    ]);

    expect(matchesJsonSchema(schema, example)).toBe(true);
    expect(example).toEqual({
      label: "Monthly recurring revenue",
      value: "$1.2M",
      trend: {
        direction: "up",
        value: "12%",
        label: "vs. previous quarter",
      },
    });
  });

  test("styles every theme color through semantic CSS variables", async () => {
    const template = await readTemplate();
    const colorVariables = [
      "--color-surface",
      "--color-border",
      "--color-text-primary",
      "--color-text-secondary",
      "--color-positive",
      "--color-negative",
      "--color-neutral",
    ];

    for (const variable of colorVariables) {
      expect(template).toContain(`var(${variable})`);
    }
    expect(template).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(template).not.toMatch(/\b(?:rgb|hsl)a?\s*\(/i);
    expect(template).not.toMatch(/:\s*(?:black|white|red|green|blue)\b/i);
  });

  test("marks every semantic placeholder for escaped interpolation", async () => {
    const template = await readTemplate();
    const placeholders = template.match(/\{\{[^{}]+\}\}/g) ?? [];

    expect(placeholders).toEqual([
      "{{escape:label}}",
      "{{escape:value}}",
      "{{escape:trend.direction}}",
      "{{escape:trend.value}}",
      "{{escape:trend.label}}",
    ]);
    expect(template).toContain('data-pdf-forge-optional="trend"');

    const rendered = renderEscapedPlaceholders(
      template,
      new Map([
        ["label", '<script>alert("metric")</script>'],
        ["value", "Revenue & profit"],
        ["trend.direction", "up"],
        ["trend.value", "+12% <unsafe>"],
        ["trend.label", 'vs. "quarter\'s" result'],
      ])
    );

    expect(rendered).toContain(
      "&lt;script&gt;alert(&quot;metric&quot;)&lt;/script&gt;"
    );
    expect(rendered).toContain("Revenue &amp; profit");
    expect(rendered).toContain("+12% &lt;unsafe&gt;");
    expect(rendered).toContain("vs. &quot;quarter&#39;s&quot; result");
    expect(rendered).not.toContain('<script>alert("metric")</script>');
  });
});
