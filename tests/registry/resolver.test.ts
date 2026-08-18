import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { resolveRegistryEntry } from "../../src/registry/resolver";

const temporaryRoots: string[] = [];

const VALID_THEME = {
  id: "ivory-editorial",
  version: "1.0.0",
  colors: {
    background: "#ffffff",
    surface: "#f8f8f8",
    border: "#dddddd",
    textPrimary: "#111111",
    textSecondary: "#555555",
    positive: "#008000",
    negative: "#cc0000",
    neutral: "#777777",
  },
  typography: {
    fontDisplay: "Display, serif",
    fontBody: "Body, sans-serif",
    fontSizeBody: "16px",
    fontSizeLabel: "12px",
    fontSizeCaption: "14px",
    fontSizeMetric: "48px",
    fontWeightSemibold: "600",
    lineHeightBody: "1.5",
    lineHeightLabel: "1.25",
    lineHeightTight: "1",
    trackingBody: "-0.01em",
    trackingHeading: "-0.02em",
    trackingLabel: "-0.01em",
  },
  spacing: {
    space3: "12px",
    space4: "16px",
    space6: "24px",
    space8: "32px",
  },
  borders: { width: "1px" },
  radii: { card: "12px" },
};

async function createPackageRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pdf-forge-resolver-"));
  temporaryRoots.push(root);
  const registryRoot = join(root, "assets/registry");
  const files = [
    ["primitives/metric-card/component.html", "<div>Metric</div>"],
    ["primitives/metric-card/schema.json", "{}"],
    ["themes/ivory-editorial.json", JSON.stringify(VALID_THEME)],
  ] as const;

  await mkdir(registryRoot, { recursive: true });
  await writeFile(
    join(registryRoot, "registry.yaml"),
    `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: primitives/metric-card/component.html
    schema: primitives/metric-card/schema.json
    formats: [docs, slides]
    themes: [ivory-editorial]
`,
    "utf-8"
  );

  for (const [relativePath, content] of files) {
    const filePath = join(registryRoot, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf-8");
  }

  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true })
    )
  );
});

describe("resolveRegistryEntry", () => {
  test("rejects malformed runtime options before resolving package paths", async () => {
    const malformedOptions = [
      null,
      {},
      {
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "../../outside",
      },
      {
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot: "",
      },
    ];

    for (const malformed of malformedOptions) {
      // SAFETY: This test intentionally crosses the public JavaScript runtime boundary.
      await expect(resolveRegistryEntry(malformed as never)).rejects.toThrow(
        "Invalid registry entry resolution options."
      );
    }
  });

  test("resolves canonical registry assets and deterministic theme CSS", async () => {
    const packageRoot = await createPackageRoot();
    const registryRoot = join(packageRoot, "assets/registry");

    const resolved = await resolveRegistryEntry({
      id: "metric-card",
      kind: "primitive",
      format: "docs",
      theme: "ivory-editorial",
      packageRoot,
    });

    expect(resolved.entry.id).toBe("metric-card");
    expect(resolved.templatePath).toBe(
      await realpath(join(registryRoot, "primitives/metric-card/component.html"))
    );
    expect(resolved.schemaPath).toBe(
      await realpath(join(registryRoot, "primitives/metric-card/schema.json"))
    );
    expect(resolved.themePath).toBe(
      await realpath(join(registryRoot, "themes/ivory-editorial.json"))
    );
    expect(resolved.cssVariables).toStartWith(
      ":root {\n  --color-background: #ffffff;"
    );
    expect(resolved.cssVariables).toEndWith(
      "  --radius-card: 12px;\n}"
    );
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.entry)).toBe(true);
  });

  test("rejects a loaded theme whose ID differs from the requested theme", async () => {
    const packageRoot = await createPackageRoot();
    const themePath = join(
      packageRoot,
      "assets/registry/themes/ivory-editorial.json"
    );
    await writeFile(
      themePath,
      JSON.stringify({ ...VALID_THEME, id: "mismatched-theme" }),
      "utf8"
    );

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      'Loaded theme id "mismatched-theme" does not match requested theme "ivory-editorial".'
    );
  });

  test("rejects an ID and kind mismatch with the available kind", async () => {
    const packageRoot = await createPackageRoot();

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "block",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      'Registry entry "metric-card" has kind "primitive", not requested kind "block".'
    );
  });

  test("rejects a format not declared by the registry entry", async () => {
    const packageRoot = await createPackageRoot();

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "social",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      'Registry entry "metric-card" does not support format "social". Supported formats: docs, slides.'
    );
  });

  test("rejects an unknown theme before resolving a theme path", async () => {
    const packageRoot = await createPackageRoot();

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "unknown-theme",
        packageRoot,
      })
    ).rejects.toThrow(
      'Registry entry "metric-card" does not support theme "unknown-theme". Supported themes: ivory-editorial.'
    );
  });

  test("rejects an unknown ID and lists the available registry IDs", async () => {
    const packageRoot = await createPackageRoot();

    await expect(
      resolveRegistryEntry({
        id: "missing-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      'Unknown registry entry id "missing-card". Available ids: metric-card.'
    );
  });

  test("rejects a traversing template path even when the target exists", async () => {
    const packageRoot = await createPackageRoot();
    const registryRoot = join(packageRoot, "assets/registry");
    const escapedTemplate = join(packageRoot, "assets/outside.html");
    await writeFile(escapedTemplate, "<div>Outside</div>", "utf-8");
    await writeFile(
      join(registryRoot, "registry.yaml"),
      `version: "1"
entries:
  - id: metric-card
    kind: primitive
    version: 1.0.0
    template: ../outside.html
    schema: primitives/metric-card/schema.json
    formats: [docs]
    themes: [ivory-editorial]
`,
      "utf-8"
    );

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      `Registry template for entry "metric-card" escapes registry root "${await realpath(registryRoot)}": "${await realpath(escapedTemplate)}".`
    );
  });

  test("rejects a schema symlink that escapes the registry root", async () => {
    const packageRoot = await createPackageRoot();
    const registryRoot = join(packageRoot, "assets/registry");
    const schemaPath = join(
      registryRoot,
      "primitives/metric-card/schema.json"
    );
    const escapedSchema = join(packageRoot, "assets/outside-schema.json");
    await writeFile(escapedSchema, "{}", "utf-8");
    await rm(schemaPath);
    await symlink(escapedSchema, schemaPath);

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      `Registry schema for entry "metric-card" escapes registry root "${await realpath(registryRoot)}": "${await realpath(escapedSchema)}".`
    );
  });

  test("rejects a theme symlink that escapes the registry root", async () => {
    const packageRoot = await createPackageRoot();
    const registryRoot = join(packageRoot, "assets/registry");
    const themePath = join(registryRoot, "themes/ivory-editorial.json");
    const escapedTheme = join(packageRoot, "assets/outside-theme.json");
    await writeFile(escapedTheme, JSON.stringify(VALID_THEME), "utf-8");
    await rm(themePath);
    await symlink(escapedTheme, themePath);

    await expect(
      resolveRegistryEntry({
        id: "metric-card",
        kind: "primitive",
        format: "docs",
        theme: "ivory-editorial",
        packageRoot,
      })
    ).rejects.toThrow(
      `Registry theme for entry "metric-card" escapes registry root "${await realpath(registryRoot)}": "${await realpath(escapedTheme)}".`
    );
  });
});
