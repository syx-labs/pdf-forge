import { readFile } from "node:fs/promises";
import { JSON_SCHEMA, load as loadYaml } from "js-yaml";
import { z } from "zod";
import type { DocumentManifest } from "./document-manifest.js";
import { resolveRegistryEntry } from "./resolver.js";

type DocumentPage = DocumentManifest["pages"][number];

export type DocumentPageComposition = Readonly<{
  html: string;
  componentIds: readonly string[];
}>;

function compositionResult(
  html: string,
  componentIds: readonly string[]
): DocumentPageComposition {
  return Object.freeze({
    html,
    componentIds: Object.freeze([...new Set(componentIds)].sort()),
  });
}

type ValidationIssue = Readonly<{
  schemaPath: string;
  dataPath: string;
  message: string;
}>;

const PLACEHOLDER_PATTERN = /\{\{([^{}]+)\}\}/gu;
const FORBIDDEN_TEMPLATE_PATTERN =
  /<\/?(?:script|iframe|frame|frameset|object|embed|applet|portal|link|base|form|input|button|audio|video|source|track|picture|img|image|use|feimage|mpath)\b|<meta\b(?=[^>]*\bhttp-equiv\s*=\s*(?:"\s*refresh\s*"|'\s*refresh\s*'|refresh\b))|\bon[a-z]+\s*=|\b(?:src|srcset|href|xlink:href|action|formaction|poster|background|ping|manifest|archive|codebase)\s*=|javascript\s*:|@import\b|url\s*\(|(?:-webkit-)?image-set\s*\(|\bimage\s*\(/iu;
const METRIC_CARD_PLACEHOLDERS = new Set([
  "label",
  "value",
  "trend.direction",
  "trend.value",
  "trend.label",
]);
const DATA_TABLE_PLACEHOLDERS = new Set([
  "columns[].key",
  "columns[].align",
  "columns[].label",
  "rows[].cells[]",
]);
const METRIC_CARD_DIRECTIVES = new Set(["optional"]);
const DATA_TABLE_DIRECTIVES = new Set([
  "each",
  "column-by-index",
  "null",
  "empty",
  "colspan",
]);
const EXECUTIVE_REPORT_DIRECTIVES = new Set(["each", "slot"]);
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "$schema",
  "$id",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "additionalProperties",
  "required",
  "properties",
  "oneOf",
  "allOf",
  "const",
  "enum",
  "minLength",
  "pattern",
  "minItems",
  "maxItems",
  "items",
]);

const blockStringPropertySchema = z.strictObject({
  type: z.literal("string"),
  minLength: z.number().int().nonnegative(),
});
const blockObjectPropertySchema = z.strictObject({
  type: z.literal("object"),
});
const executiveReportPropsDeclarationSchema = z.strictObject({
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
    title: blockStringPropertySchema,
    summary: blockStringPropertySchema,
    metrics: z.strictObject({
      type: z.literal("array"),
      minItems: z.number().int().nonnegative(),
      maxItems: z.number().int().positive(),
      items: blockObjectPropertySchema,
    }),
    table: blockObjectPropertySchema,
    recommendations: z.strictObject({
      type: z.literal("array"),
      minItems: z.number().int().nonnegative(),
      maxItems: z.number().int().positive(),
      items: blockStringPropertySchema,
    }),
  }),
});
const blockTextSectionSchema = z.strictObject({
  source: z.string().min(1),
  slot: z.string().min(1),
  repeat: z.boolean(),
});
const blockPrimitiveReferenceSchema = z.strictObject({
  id: z.string().min(1),
  source: z.string().min(1),
  slot: z.string().min(1),
  repeat: z.boolean(),
});
const executiveReportDefinitionSchema = z.strictObject({
  version: z.literal("1"),
  schema: executiveReportPropsDeclarationSchema,
  sections: z.strictObject({
    title: blockTextSectionSchema,
    summary: blockTextSectionSchema,
    recommendations: blockTextSectionSchema,
  }),
  primitives: z.strictObject({
    metrics: blockPrimitiveReferenceSchema,
    table: blockPrimitiveReferenceSchema,
  }),
});

type ExecutiveReportDefinition = z.infer<
  typeof executiveReportDefinitionSchema
>;
type BlockTextSection = z.infer<typeof blockTextSectionSchema>;
type BlockPrimitiveReference = z.infer<typeof blockPrimitiveReferenceSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function escapeHtml(value: string): string {
  let escaped = "";
  for (const character of value) {
    switch (character) {
      case "&":
        escaped += "&amp;";
        break;
      case "<":
        escaped += "&lt;";
        break;
      case ">":
        escaped += "&gt;";
        break;
      case '"':
        escaped += "&quot;";
        break;
      case "'":
        escaped += "&#39;";
        break;
      default:
        escaped += character;
    }
  }
  return escaped;
}

function replaceLiteral(
  source: string,
  searchValue: string | RegExp,
  replacement: string
): string {
  return source.replace(searchValue, () => replacement);
}

function schemaPointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function firstUnsupportedKeyword(
  schema: Readonly<Record<string, unknown>>
): string | undefined {
  return Object.keys(schema).find(
    (keyword) => !SUPPORTED_SCHEMA_KEYWORDS.has(keyword)
  );
}

function validateSchema(
  schema: unknown,
  value: unknown,
  rootSchema: unknown,
  schemaPath = "#",
  dataPath = "$"
): ValidationIssue | undefined {
  if (!isRecord(schema)) {
    return { schemaPath, dataPath, message: "schema must be an object" };
  }

  const unsupportedKeyword = firstUnsupportedKeyword(schema);
  if (unsupportedKeyword !== undefined) {
    return {
      schemaPath: `${schemaPath}/${schemaPointerSegment(unsupportedKeyword)}`,
      dataPath,
      message: `unsupported JSON Schema keyword "${unsupportedKeyword}"`,
    };
  }

  if (schema.$ref !== undefined) {
    if (typeof schema.$ref !== "string" || !schema.$ref.startsWith("#/$defs/")) {
      return {
        schemaPath: `${schemaPath}/$ref`,
        dataPath,
        message: "only local #/$defs references are supported",
      };
    }
    if (!isRecord(rootSchema) || !isRecord(rootSchema.$defs)) {
      return {
        schemaPath: `${schemaPath}/$ref`,
        dataPath,
        message: `reference "${schema.$ref}" has no definitions object`,
      };
    }
    const definitionName = schema.$ref.slice("#/$defs/".length);
    if (
      definitionName.length === 0 ||
      definitionName.includes("/") ||
      !Object.prototype.hasOwnProperty.call(rootSchema.$defs, definitionName)
    ) {
      return {
        schemaPath: `${schemaPath}/$ref`,
        dataPath,
        message: `unresolved reference "${schema.$ref}"`,
      };
    }
    return validateSchema(
      rootSchema.$defs[definitionName],
      value,
      rootSchema,
      `#/$defs/${schemaPointerSegment(definitionName)}`,
      dataPath
    );
  }

  if (schema.allOf !== undefined) {
    if (!Array.isArray(schema.allOf)) {
      return {
        schemaPath: `${schemaPath}/allOf`,
        dataPath,
        message: "allOf must be an array",
      };
    }
    for (let index = 0; index < schema.allOf.length; index += 1) {
      const issue = validateSchema(
        schema.allOf[index],
        value,
        rootSchema,
        `${schemaPath}/allOf/${index}`,
        dataPath
      );
      if (issue !== undefined) {
        return issue;
      }
    }
  }

  if (schema.oneOf !== undefined) {
    if (!Array.isArray(schema.oneOf)) {
      return {
        schemaPath: `${schemaPath}/oneOf`,
        dataPath,
        message: "oneOf must be an array",
      };
    }
    let validCandidates = 0;
    for (let index = 0; index < schema.oneOf.length; index += 1) {
      const candidate = schema.oneOf[index];
      if (
        validateSchema(
          candidate,
          value,
          rootSchema,
          `${schemaPath}/oneOf/${index}`,
          dataPath
        ) === undefined
      ) {
        validCandidates += 1;
      }
    }
    if (validCandidates !== 1) {
      return {
        schemaPath: `${schemaPath}/oneOf`,
        dataPath,
        message: `expected exactly one matching schema, found ${validCandidates}`,
      };
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(schema, "const") &&
    !Object.is(schema.const, value)
  ) {
    return {
      schemaPath: `${schemaPath}/const`,
      dataPath,
      message: "value does not equal the required constant",
    };
  }

  if (schema.enum !== undefined) {
    if (!Array.isArray(schema.enum)) {
      return {
        schemaPath: `${schemaPath}/enum`,
        dataPath,
        message: "enum must be an array",
      };
    }
    if (!schema.enum.some((candidate) => Object.is(candidate, value))) {
      return {
        schemaPath: `${schemaPath}/enum`,
        dataPath,
        message: "value is not in the allowed enum",
      };
    }
  }

  const supportedTypes = new Set([
    "object",
    "array",
    "string",
    "number",
    "boolean",
    "null",
  ]);
  if (
    schema.type !== undefined &&
    (typeof schema.type !== "string" || !supportedTypes.has(schema.type))
  ) {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: `unsupported schema type "${String(schema.type)}"`,
    };
  }

  if (schema.type === "null" && value !== null) {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: "expected null",
    };
  }
  if (schema.type === "boolean" && typeof value !== "boolean") {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: "expected a boolean",
    };
  }
  if (
    schema.type === "number" &&
    (typeof value !== "number" || !Number.isFinite(value))
  ) {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: "expected a finite number",
    };
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      return {
        schemaPath: `${schemaPath}/type`,
        dataPath,
        message: "expected a string",
      };
    }
    if (schema.minLength !== undefined) {
      if (
        typeof schema.minLength !== "number" ||
        !Number.isInteger(schema.minLength) ||
        schema.minLength < 0
      ) {
        return {
          schemaPath: `${schemaPath}/minLength`,
          dataPath,
          message: "minLength must be a non-negative integer",
        };
      }
      if (value.length < schema.minLength) {
        return {
          schemaPath: `${schemaPath}/minLength`,
          dataPath,
          message: `expected at least ${schema.minLength} characters`,
        };
      }
    }
    if (schema.pattern !== undefined) {
      if (typeof schema.pattern !== "string") {
        return {
          schemaPath: `${schemaPath}/pattern`,
          dataPath,
          message: "pattern must be a string",
        };
      }
      let pattern: RegExp;
      try {
        pattern = new RegExp(schema.pattern, "u");
      } catch (error) {
        return {
          schemaPath: `${schemaPath}/pattern`,
          dataPath,
          message: `invalid regular expression: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
      if (!pattern.test(value)) {
        return {
          schemaPath: `${schemaPath}/pattern`,
          dataPath,
          message: `string does not match pattern "${schema.pattern}"`,
        };
      }
    }
  }

  if (schema.type === "array" && !Array.isArray(value)) {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: "expected an array",
    };
  }
  if (Array.isArray(value)) {
    for (const [keyword, comparator] of [
      ["minItems", (length: number, limit: number) => length < limit],
      ["maxItems", (length: number, limit: number) => length > limit],
    ] as const) {
      const limit = schema[keyword];
      if (limit === undefined) {
        continue;
      }
      if (
        typeof limit !== "number" ||
        !Number.isInteger(limit) ||
        limit < 0
      ) {
        return {
          schemaPath: `${schemaPath}/${keyword}`,
          dataPath,
          message: `${keyword} must be a non-negative integer`,
        };
      }
      if (comparator(value.length, limit)) {
        return {
          schemaPath: `${schemaPath}/${keyword}`,
          dataPath,
          message: `array length ${value.length} violates ${keyword} ${limit}`,
        };
      }
    }
    if (schema.items !== undefined) {
      for (let index = 0; index < value.length; index += 1) {
        const issue = validateSchema(
          schema.items,
          value[index],
          rootSchema,
          `${schemaPath}/items`,
          `${dataPath}[${index}]`
        );
        if (issue !== undefined) {
          return issue;
        }
      }
    }
  }

  if (schema.type === "object" && !isRecord(value)) {
    return {
      schemaPath: `${schemaPath}/type`,
      dataPath,
      message: "expected an object",
    };
  }

  if (isRecord(value)) {
    if (schema.required !== undefined) {
      if (!Array.isArray(schema.required)) {
        return {
          schemaPath: `${schemaPath}/required`,
          dataPath,
          message: "required must be an array",
        };
      }
      for (const requiredProperty of schema.required) {
        if (typeof requiredProperty !== "string") {
          return {
            schemaPath: `${schemaPath}/required`,
            dataPath,
            message: "required entries must be strings",
          };
        }
        if (!Object.prototype.hasOwnProperty.call(value, requiredProperty)) {
          return {
            schemaPath: `${schemaPath}/required`,
            dataPath: `${dataPath}.${requiredProperty}`,
            message: "required property is missing",
          };
        }
      }
    }

    let properties: Readonly<Record<string, unknown>> = {};
    if (schema.properties !== undefined) {
      if (!isRecord(schema.properties)) {
        return {
          schemaPath: `${schemaPath}/properties`,
          dataPath,
          message: "properties must be an object",
        };
      }
      properties = schema.properties;
    }

    if (schema.additionalProperties === false) {
      const unknownProperty = Object.keys(value).find(
        (property) => !Object.prototype.hasOwnProperty.call(properties, property)
      );
      if (unknownProperty !== undefined) {
        return {
          schemaPath: `${schemaPath}/additionalProperties`,
          dataPath: `${dataPath}.${unknownProperty}`,
          message: "additional property is not allowed",
        };
      }
    }

    for (const [property, propertySchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(value, property)) {
        continue;
      }
      const issue = validateSchema(
        propertySchema,
        value[property],
        rootSchema,
        `${schemaPath}/properties/${schemaPointerSegment(property)}`,
        `${dataPath}.${property}`
      );
      if (issue !== undefined) {
        return issue;
      }
    }
  }

  return undefined;
}

function readPath(value: unknown, path: string): unknown {
  let current = value;
  for (const segment of path.split(".")) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function assertKnownPlaceholders(
  template: string,
  allowedPaths: ReadonlySet<string>,
  allowedDirectives: ReadonlySet<string>,
  entryId: string
): void {
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match = PLACEHOLDER_PATTERN.exec(template);
  while (match !== null) {
    const expression = match[1];
    if (
      expression === undefined ||
      !expression.startsWith("escape:") ||
      !allowedPaths.has(expression.slice("escape:".length))
    ) {
      throw new Error(
        `Unknown placeholder "{{${expression ?? ""}}}" in registry template for "${entryId}".`
      );
    }
    match = PLACEHOLDER_PATTERN.exec(template);
  }

  if (/\{\{|\}\}/u.test(template.replace(PLACEHOLDER_PATTERN, ""))) {
    throw new Error(
      `Malformed or unresolved placeholder in registry template for "${entryId}".`
    );
  }

  const directivePattern = /\bdata-pdf-forge-([a-z-]+)\s*=/gu;
  let directiveMatch = directivePattern.exec(template);
  while (directiveMatch !== null) {
    const directive = directiveMatch[1];
    if (directive === undefined || !allowedDirectives.has(directive)) {
      throw new Error(
        `Unknown composition directive "${directive ?? ""}" in registry template for "${entryId}".`
      );
    }
    directiveMatch = directivePattern.exec(template);
  }
}

function replaceMetricCardPlaceholders(template: string, props: unknown): string {
  let output = "";
  let cursor = 0;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match = PLACEHOLDER_PATTERN.exec(template);
  while (match !== null) {
    output += template.slice(cursor, match.index);
    const expression = match[1];
    if (expression === undefined || !expression.startsWith("escape:")) {
      throw new Error("Metric-card template contains an invalid placeholder.");
    }
    const path = expression.slice("escape:".length);
    const value = readPath(props, path);
    if (typeof value !== "string") {
      throw new Error(
        `Metric-card placeholder "${path}" could not be resolved to a string.`
      );
    }
    output += escapeHtml(value);
    cursor = match.index + match[0].length;
    match = PLACEHOLDER_PATTERN.exec(template);
  }
  output += template.slice(cursor);
  return output;
}

function renderMetricCard(template: string, props: unknown): string {
  assertKnownPlaceholders(
    template,
    METRIC_CARD_PLACEHOLDERS,
    METRIC_CARD_DIRECTIVES,
    "metric-card"
  );
  const trend = readPath(props, "trend");
  let prepared = template;
  if (trend === undefined) {
    prepared = prepared.replace(
      /\n?\s*<div\b(?=[^>]*\bdata-pdf-forge-optional="trend")[^>]*>[\s\S]*?<\/div>/iu,
      ""
    );
  } else {
    prepared = prepared.replace(
      /\s+data-pdf-forge-optional="trend"/gu,
      ""
    );
  }
  return replaceMetricCardPlaceholders(prepared, props);
}

function renderFragmentValues(
  fragment: string,
  values: ReadonlyMap<string, string>,
  entryId: string
): string {
  let output = "";
  let cursor = 0;
  PLACEHOLDER_PATTERN.lastIndex = 0;
  let match = PLACEHOLDER_PATTERN.exec(fragment);
  while (match !== null) {
    output += fragment.slice(cursor, match.index);
    const expression = match[1];
    if (expression === undefined || !expression.startsWith("escape:")) {
      throw new Error(
        `Registry template for "${entryId}" contains an invalid placeholder.`
      );
    }
    const path = expression.slice("escape:".length);
    const value = values.get(path);
    if (value === undefined) {
      throw new Error(
        `Registry template placeholder "${path}" for "${entryId}" is unresolved.`
      );
    }
    output += escapeHtml(value);
    cursor = match.index + match[0].length;
    match = PLACEHOLDER_PATTERN.exec(fragment);
  }
  output += fragment.slice(cursor);
  return output;
}

function requireMatchedFragment(
  source: string,
  pattern: RegExp,
  contract: string
): string {
  const fragment = source.match(pattern)?.[0];
  if (fragment === undefined) {
    throw new Error(`Data-table template is missing ${contract}.`);
  }
  return fragment;
}

function scalarCellText(value: unknown, nullText: string): string {
  if (value === null) {
    return nullText;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  throw new Error("Validated data-table cell is not a supported scalar value.");
}

function renderDataTable(template: string, props: unknown): string {
  assertKnownPlaceholders(
    template,
    DATA_TABLE_PLACEHOLDERS,
    DATA_TABLE_DIRECTIVES,
    "data-table"
  );
  if (!isRecord(props) || !Array.isArray(props.columns) || !Array.isArray(props.rows)) {
    throw new Error("Validated data-table props do not contain columns and rows.");
  }

  const columnFragment = requireMatchedFragment(
    template,
    /<th\b(?=[^>]*\bdata-pdf-forge-each="columns")[^>]*>[\s\S]*?<\/th>/u,
    "the columns iteration"
  );
  const rowFragment = requireMatchedFragment(
    template,
    /<tr\b(?=[^>]*\bdata-pdf-forge-each="rows")[^>]*>[\s\S]*?<\/tr>/u,
    "the rows iteration"
  );
  const cellFragment = requireMatchedFragment(
    rowFragment,
    /<td\b(?=[^>]*\bdata-pdf-forge-each="rows\[\]\.cells")[^>]*>[\s\S]*?<\/td>/u,
    "the cells iteration"
  );
  const emptyFragment = requireMatchedFragment(
    template,
    /<tr\b(?=[^>]*\bdata-pdf-forge-empty="rows")[^>]*>[\s\S]*?<\/tr>/u,
    "the empty state"
  );
  const nullText = cellFragment.match(/\bdata-pdf-forge-null="([^"]*)"/u)?.[1];
  if (nullText === undefined) {
    throw new Error("Data-table template is missing its explicit null text.");
  }

  const renderedColumns: string[] = [];
  for (const column of props.columns) {
    if (
      !isRecord(column) ||
      typeof column.key !== "string" ||
      typeof column.label !== "string" ||
      typeof column.align !== "string"
    ) {
      throw new Error("Validated data-table column has an invalid shape.");
    }
    const preparedColumn = columnFragment.replace(
      /\s+data-pdf-forge-each="columns"/u,
      ""
    );
    renderedColumns.push(
      renderFragmentValues(
        preparedColumn,
        new Map([
          ["columns[].key", column.key],
          ["columns[].align", column.align],
          ["columns[].label", column.label],
        ]),
        "data-table"
      )
    );
  }

  if (props.rows.length === 0) {
    const emptyWithoutDirective = emptyFragment.replace(
      /\s+data-pdf-forge-empty="rows"/u,
      ""
    );
    const preparedEmpty = replaceLiteral(
      emptyWithoutDirective,
      /\s+data-pdf-forge-colspan="columns"/u,
      ` colspan="${props.columns.length}"`
    );
    return replaceLiteral(
      replaceLiteral(
        replaceLiteral(template, columnFragment, renderedColumns.join("\n")),
        rowFragment,
        ""
      ),
      emptyFragment,
      preparedEmpty
    );
  }

  const renderedRows: string[] = [];
  for (const row of props.rows) {
    if (!isRecord(row) || !Array.isArray(row.cells)) {
      throw new Error("Validated data-table row has an invalid shape.");
    }
    const renderedCells: string[] = [];
    for (let index = 0; index < row.cells.length; index += 1) {
      const column = props.columns[index];
      if (!isRecord(column) || typeof column.align !== "string") {
        throw new Error("Data-table cell has no corresponding validated column.");
      }
      const preparedCell = cellFragment
        .replace(/\s+data-pdf-forge-each="rows\[\]\.cells"/u, "")
        .replace(/\s+data-pdf-forge-column-by-index="columns"/u, "")
        .replace(/\s+data-pdf-forge-null="[^"]*"/u, "");
      renderedCells.push(
        renderFragmentValues(
          preparedCell,
          new Map([
            ["columns[].align", column.align],
            ["rows[].cells[]", scalarCellText(row.cells[index], nullText)],
          ]),
          "data-table"
        )
      );
    }

    const preparedRow = replaceLiteral(
      rowFragment.replace(/\s+data-pdf-forge-each="rows"/u, ""),
      cellFragment,
      renderedCells.join("\n")
    );
    renderedRows.push(preparedRow);
  }

  return replaceLiteral(
    replaceLiteral(
      replaceLiteral(template, columnFragment, renderedColumns.join("\n")),
      rowFragment,
      renderedRows.join("\n")
    ),
    emptyFragment,
    ""
  );
}

function assertTemplateSafe(template: string, entryId: string): void {
  const forbidden = template.match(FORBIDDEN_TEMPLATE_PATTERN)?.[0];
  if (forbidden !== undefined) {
    throw new Error(
      `Unsafe template content "${forbidden}" is not allowed for registry entry "${entryId}".`
    );
  }
}

function assertCssVariablesSafe(cssVariables: string): void {
  const lines = cssVariables.split("\n");
  if (lines[0] !== ":root {" || lines.at(-1) !== "}") {
    throw new Error("Resolved theme CSS variables are not a closed :root block.");
  }
  for (const line of lines.slice(1, -1)) {
    if (!/^  --[a-z0-9-]+: [^;{}<>\r\n]+;$/u.test(line)) {
      throw new Error(`Unsafe theme CSS declaration "${line}".`);
    }
    if (/javascript\s*:|@import\b|url\s*\(|expression\s*\(/iu.test(line)) {
      throw new Error(`Networked or executable theme CSS is not allowed: "${line}".`);
    }
  }
}

function parseExecutiveReportDefinition(
  rawDefinition: string,
  schemaPath: string
): ExecutiveReportDefinition {
  let document: unknown;
  try {
    document = loadYaml(rawDefinition, { schema: JSON_SCHEMA });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse block YAML at schemaPath "${schemaPath}": ${detail}`,
      { cause: error }
    );
  }

  const result = executiveReportDefinitionSchema.safeParse(document);
  if (!result.success) {
    throw new Error(
      `Invalid executive-report block definition at schemaPath "${schemaPath}": ${z.prettifyError(result.error)}`
    );
  }
  return result.data;
}

function countOccurrences(source: string, marker: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor <= source.length - marker.length) {
    const index = source.indexOf(marker, cursor);
    if (index === -1) {
      break;
    }
    count += 1;
    cursor = index + marker.length;
  }
  return count;
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function assertCompositionIdentifier(
  value: string,
  label: string,
  pattern: RegExp
): void {
  if (!pattern.test(value)) {
    throw new Error(
      `Invalid executive-report ${label} "${value}" in block definition.`
    );
  }
}

function assertExecutiveReportDefinitionContract(
  definition: ExecutiveReportDefinition
): void {
  const identifierPattern = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/u;
  const sourcePattern = /^[A-Za-z][A-Za-z0-9]*$/u;
  const sections = definition.sections;
  const primitives = definition.primitives;

  if (
    sections.title.source !== "title" ||
    sections.title.repeat ||
    sections.summary.source !== "summary" ||
    sections.summary.repeat ||
    sections.recommendations.source !== "recommendations" ||
    !sections.recommendations.repeat ||
    primitives.metrics.source !== "metrics" ||
    !primitives.metrics.repeat ||
    primitives.table.source !== "table" ||
    primitives.table.repeat
  ) {
    throw new Error(
      "Executive-report block references must preserve the declared title, summary, recommendations, metrics, and table cardinalities."
    );
  }

  for (const [name, section] of Object.entries(sections)) {
    assertCompositionIdentifier(section.source, `${name} source`, sourcePattern);
    assertCompositionIdentifier(section.slot, `${name} slot`, identifierPattern);
  }
  for (const [name, reference] of Object.entries(primitives)) {
    assertCompositionIdentifier(reference.id, `${name} primitive id`, identifierPattern);
    assertCompositionIdentifier(reference.source, `${name} source`, sourcePattern);
    assertCompositionIdentifier(reference.slot, `${name} slot`, identifierPattern);
  }
}

function assertExecutiveReportTemplateContract(
  template: string,
  definition: ExecutiveReportDefinition
): void {
  assertTemplateSafe(template, "executive-report");
  if (/<!doctype\b|<\/?(?:html|head|body)\b/iu.test(template)) {
    throw new Error(
      "Executive-report registry template must be a fragment without document shell elements."
    );
  }

  const sections = definition.sections;
  const primitives = definition.primitives;
  const allowedPlaceholders = new Set([
    sections.title.source,
    sections.summary.source,
    `${sections.recommendations.source}[]`,
  ]);
  assertKnownPlaceholders(
    template,
    allowedPlaceholders,
    EXECUTIVE_REPORT_DIRECTIVES,
    "executive-report"
  );

  const declaredSlots = [
    sections.title.slot,
    sections.summary.slot,
    sections.recommendations.slot,
    primitives.metrics.slot,
    primitives.table.slot,
  ];
  const declaredSlotSet = new Set(declaredSlots);
  if (declaredSlotSet.size !== declaredSlots.length) {
    throw new Error("Executive-report block definition contains duplicate slots.");
  }

  const templateSlots: string[] = [];
  const slotPattern = /\bdata-pdf-forge-slot="([^"]*)"/gu;
  let slotMatch = slotPattern.exec(template);
  while (slotMatch !== null) {
    const slot = slotMatch[1] ?? "";
    if (!declaredSlotSet.has(slot)) {
      throw new Error(
        `Unknown executive-report template slot "${slot}" is not declared by block.yaml.`
      );
    }
    templateSlots.push(slot);
    slotMatch = slotPattern.exec(template);
  }
  for (const slot of declaredSlots) {
    const occurrences = templateSlots.filter(
      (templateSlot) => templateSlot === slot
    ).length;
    if (occurrences !== 1) {
      throw new Error(
        `Executive-report template slot "${slot}" must occur exactly once; found ${occurrences}.`
      );
    }
  }

  const recommendationSource = sections.recommendations.source;
  const eachValues = Array.from(
    template.matchAll(/\bdata-pdf-forge-each="([^"]*)"/gu),
    (match) => match[1] ?? ""
  );
  if (
    eachValues.length !== 1 ||
    eachValues[0] !== recommendationSource
  ) {
    throw new Error(
      `Executive-report template must declare exactly one recommendations iterator for "${recommendationSource}".`
    );
  }

  for (const placeholder of allowedPlaceholders) {
    const marker = `{{escape:${placeholder}}}`;
    const occurrences = countOccurrences(template, marker);
    if (occurrences !== 1) {
      throw new Error(
        `Executive-report placeholder "${marker}" must occur exactly once; found ${occurrences}.`
      );
    }
  }
}

type SlotElement = Readonly<{
  full: string;
  opening: string;
  content: string;
  closing: string;
}>;

function requireSlotElement(template: string, slot: string): SlotElement {
  const escapedSlot = escapeRegularExpression(slot);
  const pattern = new RegExp(
    `(<([a-z][a-z0-9-]*)\\b(?=[^>]*\\bdata-pdf-forge-slot="${escapedSlot}")[^>]*>)([\\s\\S]*?)(<\\/\\2>)`,
    "u"
  );
  const match = template.match(pattern);
  if (
    match?.[0] === undefined ||
    match[1] === undefined ||
    match[3] === undefined ||
    match[4] === undefined
  ) {
    throw new Error(
      `Executive-report template is missing a valid element for slot "${slot}".`
    );
  }
  return {
    full: match[0],
    opening: match[1],
    content: match[3],
    closing: match[4],
  };
}

function renderSingleTextSection(
  template: string,
  section: BlockTextSection,
  props: unknown,
  sectionName: string
): string {
  const value = readPath(props, section.source);
  if (typeof value !== "string") {
    throw new Error(
      `Validated executive-report ${sectionName} source "${section.source}" is not a string.`
    );
  }
  const slot = requireSlotElement(template, section.slot);
  const marker = `{{escape:${section.source}}}`;
  if (countOccurrences(slot.content, marker) !== 1) {
    throw new Error(
      `Executive-report ${sectionName} placeholder is not inside slot "${section.slot}".`
    );
  }
  return replaceLiteral(
    template,
    slot.full,
    `${slot.opening}${replaceLiteral(slot.content, marker, escapeHtml(value))}${slot.closing}`
  );
}

function renderRecommendations(
  template: string,
  section: BlockTextSection,
  props: unknown
): string {
  const values = readPath(props, section.source);
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) {
    throw new Error(
      `Validated executive-report recommendations source "${section.source}" is not a string array.`
    );
  }

  const slot = requireSlotElement(template, section.slot);
  const escapedSource = escapeRegularExpression(section.source);
  const itemPattern = new RegExp(
    `<([a-z][a-z0-9-]*)\\b(?=[^>]*\\bdata-pdf-forge-each="${escapedSource}")[^>]*>[\\s\\S]*?<\\/\\1>`,
    "u"
  );
  const item = slot.content.match(itemPattern)?.[0];
  if (item === undefined) {
    throw new Error(
      `Executive-report recommendations slot "${section.slot}" has no iterator element.`
    );
  }
  const marker = `{{escape:${section.source}[]}}`;
  if (countOccurrences(item, marker) !== 1) {
    throw new Error(
      "Executive-report recommendations iterator has no unique escaped placeholder."
    );
  }

  const directivePattern = new RegExp(
    `\\s+data-pdf-forge-each="${escapedSource}"`,
    "u"
  );
  const preparedItem = item.replace(directivePattern, "");
  const renderedItems = values
    .map((value) => replaceLiteral(preparedItem, marker, escapeHtml(value)))
    .join("\n");
  return replaceLiteral(
    template,
    slot.full,
    `${slot.opening}${replaceLiteral(slot.content, item, renderedItems)}${slot.closing}`
  );
}

function extractPrimitiveFragment(html: string, primitiveId: string): string {
  const body = html.match(/<body\b[^>]*>\n([\s\S]*)\n<\/body>\n<\/html>\n$/u)?.[1];
  if (body === undefined) {
    throw new Error(
      `Composed primitive "${primitiveId}" did not return the expected document shell.`
    );
  }
  if (/<!doctype\b|<\/?(?:html|head|body)\b/iu.test(body)) {
    throw new Error(
      `Composed primitive "${primitiveId}" contains a nested document shell.`
    );
  }
  return body.trim();
}

async function composePrimitiveReference(
  manifest: DocumentManifest,
  page: DocumentPage,
  reference: BlockPrimitiveReference,
  packageRoot?: string
): Promise<string[]> {
  const sourceValue = readPath(page.props, reference.source);
  const values = reference.repeat ? sourceValue : [sourceValue];
  if (!Array.isArray(values)) {
    throw new Error(
      `Validated executive-report primitive source "${reference.source}" is not repeatable.`
    );
  }

  const fragments: string[] = [];
  for (const value of values) {
    const primitivePage: DocumentPage = {
      id: page.id,
      selection: { kind: "primitive", id: reference.id },
      props: value,
    };
    const html = await composePrimitivePage(manifest, primitivePage, packageRoot);
    fragments.push(extractPrimitiveFragment(html, reference.id));
  }
  return fragments;
}

function injectPrimitiveFragments(
  template: string,
  slotName: string,
  fragments: readonly string[]
): string {
  const slot = requireSlotElement(template, slotName);
  if (slot.content.trim().length !== 0) {
    throw new Error(
      `Executive-report primitive slot "${slotName}" must be empty before composition.`
    );
  }
  return replaceLiteral(
    template,
    slot.full,
    `${slot.opening}\n${fragments.join("\n")}\n${slot.closing}`
  );
}

function finishBlockFragment(fragment: string): string {
  const output = fragment.replace(
    /\s+data-pdf-forge-slot="[^"]*"/gu,
    ""
  );
  if (/\{\{|\}\}|\bdata-pdf-forge-/u.test(output)) {
    throw new Error(
      "Executive-report composition left an unresolved placeholder or directive."
    );
  }
  if (/<!doctype\b|<\/?(?:html|head|body)\b/iu.test(output)) {
    throw new Error("Executive-report composition produced a nested document shell.");
  }
  return output;
}

function pageShell(
  manifest: DocumentManifest,
  page: DocumentPage,
  cssVariables: string,
  componentHtml: string
): string {
  const dimensions =
    manifest.format === "docs"
      ? {
          className: "w-[210mm] min-h-[297mm]",
          css: "width: 210mm; min-height: 297mm;",
        }
      : {
          className: "w-[1920px] h-[1080px]",
          css: "width: 1920px; height: 1080px;",
        };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(manifest.documentId)} — ${escapeHtml(page.id)}</title>
  <style>
${cssVariables}
    html { --tw-pdf-forge-ready: 1; }
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      ${dimensions.css}
      overflow: hidden;
      background: var(--color-background);
      color: var(--color-text-primary);
      font-family: var(--font-body);
    }
  </style>
</head>
<body class="${dimensions.className}" data-document-id="${escapeHtml(manifest.documentId)}" data-page-id="${escapeHtml(page.id)}" data-registry-entry="${escapeHtml(page.selection.id)}">
${componentHtml.trimEnd()}
</body>
</html>
`;
}

export async function composePrimitivePage(
  manifest: DocumentManifest,
  page: DocumentPage,
  packageRoot?: string
): Promise<string> {
  if (page.selection.kind !== "primitive") {
    throw new Error(
      `Registry block composition is not supported by composePrimitivePage: "${page.selection.id}".`
    );
  }

  const resolved = await resolveRegistryEntry({
    id: page.selection.id,
    kind: page.selection.kind,
    format: manifest.format,
    theme: manifest.theme,
    packageRoot,
  });
  const [template, rawSchema] = await Promise.all([
    readFile(resolved.templatePath, "utf-8"),
    readFile(resolved.schemaPath, "utf-8"),
  ]);

  let schema: unknown;
  try {
    schema = JSON.parse(rawSchema);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to parse JSON Schema at schemaPath "${resolved.schemaPath}": ${detail}`,
      { cause: error }
    );
  }

  const issue = validateSchema(schema, page.props, schema);
  if (issue !== undefined) {
    throw new Error(
      `Invalid props for registry entry "${resolved.entry.id}" using schema file "${resolved.schemaPath}": dataPath "${issue.dataPath}", schemaPath "${issue.schemaPath}": ${issue.message}.`
    );
  }

  assertTemplateSafe(template, resolved.entry.id);
  assertCssVariablesSafe(resolved.cssVariables);

  let componentHtml: string;
  if (resolved.entry.id === "metric-card") {
    componentHtml = renderMetricCard(template, page.props);
  } else if (resolved.entry.id === "data-table") {
    componentHtml = renderDataTable(template, page.props);
  } else {
    throw new Error(
      `Primitive composition is not implemented for registry entry "${resolved.entry.id}".`
    );
  }

  return pageShell(manifest, page, resolved.cssVariables, componentHtml);
}

export async function composeDocumentPageWithMetadata(
  manifest: DocumentManifest,
  page: DocumentPage,
  packageRoot?: string
): Promise<DocumentPageComposition> {
  if (page.selection.kind === "primitive") {
    return compositionResult(
      await composePrimitivePage(manifest, page, packageRoot),
      [page.selection.id]
    );
  }

  const resolved = await resolveRegistryEntry({
    id: page.selection.id,
    kind: page.selection.kind,
    format: manifest.format,
    theme: manifest.theme,
    packageRoot,
  });
  if (resolved.entry.id !== "executive-report") {
    throw new Error(
      `Block composition is not implemented for registry entry "${resolved.entry.id}".`
    );
  }

  const [template, rawDefinition] = await Promise.all([
    readFile(resolved.templatePath, "utf-8"),
    readFile(resolved.schemaPath, "utf-8"),
  ]);
  const definition = parseExecutiveReportDefinition(
    rawDefinition,
    resolved.schemaPath
  );
  assertExecutiveReportDefinitionContract(definition);

  const issue = validateSchema(definition.schema, page.props, definition.schema);
  if (issue !== undefined) {
    throw new Error(
      `Invalid props for registry entry "${resolved.entry.id}" using schema file "${resolved.schemaPath}": dataPath "${issue.dataPath}", schemaPath "${issue.schemaPath}": ${issue.message}.`
    );
  }

  assertCssVariablesSafe(resolved.cssVariables);
  assertExecutiveReportTemplateContract(template, definition);

  let blockFragment = renderSingleTextSection(
    template,
    definition.sections.title,
    page.props,
    "title"
  );
  blockFragment = renderSingleTextSection(
    blockFragment,
    definition.sections.summary,
    page.props,
    "summary"
  );
  blockFragment = renderRecommendations(
    blockFragment,
    definition.sections.recommendations,
    page.props
  );

  const [metrics, table] = await Promise.all([
    composePrimitiveReference(
      manifest,
      page,
      definition.primitives.metrics,
      packageRoot
    ),
    composePrimitiveReference(
      manifest,
      page,
      definition.primitives.table,
      packageRoot
    ),
  ]);
  blockFragment = injectPrimitiveFragments(
    blockFragment,
    definition.primitives.metrics.slot,
    metrics
  );
  blockFragment = injectPrimitiveFragments(
    blockFragment,
    definition.primitives.table.slot,
    table
  );

  const html = pageShell(
    manifest,
    page,
    resolved.cssVariables,
    finishBlockFragment(blockFragment)
  );
  return compositionResult(html, [
    page.selection.id,
    definition.primitives.metrics.id,
    definition.primitives.table.id,
  ]);
}

export async function composeDocumentPage(
  manifest: DocumentManifest,
  page: DocumentPage,
  packageRoot?: string
): Promise<string> {
  return (
    await composeDocumentPageWithMetadata(manifest, page, packageRoot)
  ).html;
}
