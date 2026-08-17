import { describe, expect, test } from "bun:test";
import {
  RegistryEntrySchema,
  RegistrySchema,
} from "../../src/registry/schemas";

const primitiveEntry = {
  id: "metric-card",
  kind: "primitive",
  version: "1.0.0",
  template: "primitives/metric-card/component.html",
  schema: "primitives/metric-card/schema.json",
  formats: ["docs", "slides"],
  themes: ["ivory-editorial"],
};

const blockEntry = {
  id: "executive-report",
  kind: "block",
  version: "1.0.0",
  template: "blocks/executive-report/template.html",
  schema: "blocks/executive-report/schema.json",
  formats: ["docs"],
  themes: ["ivory-editorial"],
};

describe("RegistryEntrySchema", () => {
  test("parses primitive and block entries as a discriminated union", () => {
    const primitive = RegistryEntrySchema.parse(primitiveEntry);
    const block = RegistryEntrySchema.parse(blockEntry);

    expect(primitive.id).toBe("metric-card");
    expect(primitive.kind).toBe("primitive");
    expect(block.kind).toBe("block");
  });

  test("rejects unsupported entry kinds", () => {
    expect(
      RegistryEntrySchema.safeParse({
        ...primitiveEntry,
        kind: "widget",
      }).success
    ).toBe(false);
  });

  test("rejects entries without a template path", () => {
    expect(
      RegistryEntrySchema.safeParse({
        id: primitiveEntry.id,
        kind: primitiveEntry.kind,
        version: primitiveEntry.version,
        schema: primitiveEntry.schema,
        formats: primitiveEntry.formats,
        themes: primitiveEntry.themes,
      }).success
    ).toBe(false);
  });

  test("rejects entries without a schema path", () => {
    expect(
      RegistryEntrySchema.safeParse({
        id: primitiveEntry.id,
        kind: primitiveEntry.kind,
        version: primitiveEntry.version,
        template: primitiveEntry.template,
        formats: primitiveEntry.formats,
        themes: primitiveEntry.themes,
      }).success
    ).toBe(false);
  });

  test("rejects unknown entry fields", () => {
    expect(
      RegistryEntrySchema.safeParse({
        ...primitiveEntry,
        renderer: "react",
      }).success
    ).toBe(false);
  });

  test("requires at least one supported format", () => {
    expect(
      RegistryEntrySchema.safeParse({
        ...primitiveEntry,
        formats: [],
      }).success
    ).toBe(false);
  });

  test("requires at least one theme", () => {
    expect(
      RegistryEntrySchema.safeParse({
        ...primitiveEntry,
        themes: [],
      }).success
    ).toBe(false);
  });
});

describe("RegistrySchema", () => {
  test("parses registry version 1", () => {
    const parsed = RegistrySchema.parse({
      version: "1",
      entries: [primitiveEntry, blockEntry],
    });

    expect(parsed.version).toBe("1");
    expect(parsed.entries).toHaveLength(2);
  });

  test("preserves duplicate entries for the loader to reject", () => {
    const parsed = RegistrySchema.parse({
      version: "1",
      entries: [primitiveEntry, primitiveEntry],
    });

    expect(parsed.entries.map((entry) => entry.id)).toEqual([
      "metric-card",
      "metric-card",
    ]);
  });

  test("rejects unknown top-level fields", () => {
    expect(
      RegistrySchema.safeParse({
        version: "1",
        entries: [primitiveEntry],
        generatedAt: "2026-08-17T00:00:00Z",
      }).success
    ).toBe(false);
  });
});
