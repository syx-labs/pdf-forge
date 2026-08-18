import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "../../src/registry/loader";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const primitiveRoot = join(
  packageRoot,
  "assets/registry/primitives/data-table"
);

async function readSchema(): Promise<unknown> {
  const raw = await readFile(join(primitiveRoot, "schema.json"), "utf-8");
  const schema: unknown = JSON.parse(raw);
  return schema;
}

async function readExample(): Promise<unknown> {
  const raw = await readFile(join(primitiveRoot, "example.json"), "utf-8");
  const example: unknown = JSON.parse(raw);
  return example;
}

async function readTemplate(): Promise<string> {
  return readFile(join(primitiveRoot, "component.html"), "utf-8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveReference(root: unknown, reference: string): unknown {
  const prefix = "#/$defs/";
  if (!reference.startsWith(prefix) || !isRecord(root)) {
    return undefined;
  }

  const definitions = root.$defs;
  if (!isRecord(definitions)) {
    return undefined;
  }

  return definitions[reference.slice(prefix.length)];
}

function matchesJsonSchema(
  schema: unknown,
  value: unknown,
  root: unknown = schema
): boolean {
  if (!isRecord(schema)) {
    return true;
  }

  if (typeof schema.$ref === "string") {
    const referencedSchema = resolveReference(root, schema.$ref);
    return (
      referencedSchema !== undefined &&
      matchesJsonSchema(referencedSchema, value, root)
    );
  }

  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every((candidate) => matchesJsonSchema(candidate, value, root))
  ) {
    return false;
  }

  if (
    Array.isArray(schema.oneOf) &&
    schema.oneOf.filter((candidate) => matchesJsonSchema(candidate, value, root))
      .length !== 1
  ) {
    return false;
  }

  if ("const" in schema && !Object.is(schema.const, value)) {
    return false;
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    return false;
  }

  switch (schema.type) {
    case "null":
      if (value !== null) return false;
      break;
    case "boolean":
      if (typeof value !== "boolean") return false;
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      break;
    case "string":
      if (typeof value !== "string") return false;
      break;
    case "array":
      if (!Array.isArray(value)) return false;
      break;
    case "object":
      if (!isRecord(value)) return false;
      break;
  }

  if (typeof value === "string") {
    if (
      typeof schema.minLength === "number" &&
      value.length < schema.minLength
    ) {
      return false;
    }
    if (
      typeof schema.pattern === "string" &&
      !new RegExp(schema.pattern, "u").test(value)
    ) {
      return false;
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      return false;
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      return false;
    }
    if (
      schema.items !== undefined &&
      !value.every((item) => matchesJsonSchema(schema.items, item, root))
    ) {
      return false;
    }
  }

  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (
      Array.isArray(schema.required) &&
      schema.required.some(
        (property) =>
          typeof property === "string" &&
          !Object.prototype.hasOwnProperty.call(value, property)
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
    if (
      !Object.entries(properties).every(
        ([property, propertySchema]) =>
          !(property in value) ||
          matchesJsonSchema(propertySchema, value[property], root)
      )
    ) {
      return false;
    }
  }

  return true;
}

const escapedPlaceholderPattern =
  /\{\{escape:([a-z]+(?:\[\])?(?:\.[a-z]+(?:\[\])?)*)\}\}/g;

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

function columnKeys(example: unknown): readonly string[] {
  if (!isRecord(example) || !Array.isArray(example.columns)) {
    return [];
  }

  return example.columns.flatMap((column) => {
    if (!isRecord(column) || typeof column.key !== "string") {
      return [];
    }
    return [column.key];
  });
}

describe("data-table primitive", () => {
  test("is registered with its canonical assets and supported surfaces", async () => {
    const registry = await loadRegistry(packageRoot);
    const dataTable = registry.entries.find(
      (entry) => entry.id === "data-table"
    );

    expect(dataTable).toEqual({
      id: "data-table",
      kind: "primitive",
      version: "1.0.0",
      template: "primitives/data-table/component.html",
      schema: "primitives/data-table/schema.json",
      formats: ["docs", "slides"],
      themes: ["ivory-editorial"],
    });
  });

  test("ships a schema-valid example whose column order is explicit", async () => {
    const [schema, example] = await Promise.all([readSchema(), readExample()]);

    expect(matchesJsonSchema(schema, example)).toBe(true);
    expect(columnKeys(example)).toEqual(["quarter", "revenue", "growth"]);
  });

  test("requires strongly structured columns and rows with no unknown fields", async () => {
    const schema = await readSchema();
    const validTable = {
      columns: [{ key: "name", label: "Name", align: "left" }],
      rows: [{ cells: ["Ada"] }],
    };

    expect(matchesJsonSchema(schema, validTable)).toBe(true);
    expect(
      matchesJsonSchema(schema, { ...validTable, html: "<b>unsafe</b>" })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        columns: [
          { key: "name", label: "Name", align: "left", color: "red" },
        ],
        rows: validTable.rows,
      })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        columns: validTable.columns,
        rows: [{ cells: ["Ada"], rawHtml: "<b>Ada</b>" }],
      })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        columns: validTable.columns,
        rows: [{ cells: [{ html: "<b>Ada</b>" }] }],
      })
    ).toBe(false);
  });

  test("requires every row cell count to equal the column count", async () => {
    const schema = await readSchema();
    const columns = [
      { key: "name", label: "Name", align: "left" },
      { key: "score", label: "Score", align: "right" },
    ];

    expect(
      matchesJsonSchema(schema, { columns, rows: [{ cells: ["Ada", 98] }] })
    ).toBe(true);
    expect(
      matchesJsonSchema(schema, { columns, rows: [{ cells: ["Ada"] }] })
    ).toBe(false);
    expect(
      matchesJsonSchema(schema, {
        columns,
        rows: [{ cells: ["Ada", 98, "extra"] }],
      })
    ).toBe(false);
  });

  test("enforces the configured twelve-row bound and permits an empty table", async () => {
    const schema = await readSchema();
    const columns = [{ key: "index", label: "Index", align: "right" }];
    const twelveRows = Array.from({ length: 12 }, (_, index) => ({
      cells: [index + 1],
    }));

    expect(matchesJsonSchema(schema, { columns, rows: [] })).toBe(true);
    expect(matchesJsonSchema(schema, { columns, rows: twelveRows })).toBe(true);
    expect(
      matchesJsonSchema(schema, {
        columns,
        rows: [...twelveRows, { cells: [13] }],
      })
    ).toBe(false);
  });

  test("declares the ordered iteration, null, and empty-state contract for Task 10", async () => {
    const template = await readTemplate();
    const columnIteration = template.indexOf(
      'data-pdf-forge-each="columns"'
    );
    const rowIteration = template.indexOf('data-pdf-forge-each="rows"');
    const cellIteration = template.indexOf(
      'data-pdf-forge-each="rows[].cells"'
    );

    expect(columnIteration).toBeGreaterThan(-1);
    expect(rowIteration).toBeGreaterThan(columnIteration);
    expect(cellIteration).toBeGreaterThan(rowIteration);
    expect(template).toContain('data-pdf-forge-null="—"');
    expect(template).toContain(
      'data-pdf-forge-column-by-index="columns"'
    );
    expect(template).toContain('data-pdf-forge-empty="rows"');
    expect(template).toContain("No data available.");
  });

  test("marks every semantic value for escaped interpolation and exposes no raw HTML slot", async () => {
    const template = await readTemplate();
    const placeholders = template.match(/\{\{[^{}]+\}\}/g) ?? [];

    expect(placeholders).toEqual([
      "{{escape:columns[].key}}",
      "{{escape:columns[].align}}",
      "{{escape:columns[].label}}",
      "{{escape:columns[].align}}",
      "{{escape:rows[].cells[]}}",
    ]);
    expect(template).not.toContain("{{{");
    expect(template).not.toMatch(/\{\{(?:raw|html):/i);

    const rendered = renderEscapedPlaceholders(
      template,
      new Map([
        ["columns[].key", 'name" onmouseover="alert(1)'],
        ["columns[].align", "left"],
        ["columns[].label", '<script>alert("column")</script>'],
        ["rows[].cells[]", "Revenue & <profit>"],
      ])
    );

    expect(rendered).toContain("name&quot; onmouseover=&quot;alert(1)");
    expect(rendered).toContain(
      "&lt;script&gt;alert(&quot;column&quot;)&lt;/script&gt;"
    );
    expect(rendered).toContain("Revenue &amp; &lt;profit&gt;");
    expect(rendered).not.toContain('<script>alert("column")</script>');
  });

  test("styles every theme color through semantic CSS variables", async () => {
    const template = await readTemplate();

    for (const variable of [
      "--color-surface",
      "--color-border",
      "--color-text-primary",
      "--color-text-secondary",
    ]) {
      expect(template).toContain(`var(${variable})`);
    }
    expect(template).not.toMatch(/#[\da-f]{3,8}\b/i);
    expect(template).not.toMatch(/\b(?:rgb|hsl)a?\s*\(/i);
    expect(template).not.toMatch(/:\s*(?:black|white|red|green|blue)\b/i);
  });
});
