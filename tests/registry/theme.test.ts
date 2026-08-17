import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ThemeSchema,
  themeToCssVariables,
} from "../../src/registry/theme";

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
const themePath = join(
  packageRoot,
  "assets/registry/themes/ivory-editorial.json"
);

async function readTheme(): Promise<unknown> {
  return JSON.parse(await readFile(themePath, "utf-8"));
}

describe("registry theme contract", () => {
  test("validates the shipped ivory-editorial theme", async () => {
    const theme = ThemeSchema.parse(await readTheme());

    expect(theme.id).toBe("ivory-editorial");
    expect(theme.version).toBe("1.0.0");
    expect(theme.colors.surface).toBe("#EFE8D9");
    expect(theme.typography.fontDisplay).toContain("Cormorant Garamond");
    expect(theme.spacing.space6).toBe("24px");
    expect(theme.borders.width).toBe("1px");
    expect(theme.radii.card).toBe("12px");
  });

  test("rejects missing required groups and nested tokens", async () => {
    const theme = ThemeSchema.parse(await readTheme());
    const withoutRadii = {
      id: theme.id,
      version: theme.version,
      colors: theme.colors,
      typography: theme.typography,
      spacing: theme.spacing,
      borders: theme.borders,
    };
    const withoutSurface = {
      ...theme,
      colors: {
        background: theme.colors.background,
        border: theme.colors.border,
        textPrimary: theme.colors.textPrimary,
        textSecondary: theme.colors.textSecondary,
        positive: theme.colors.positive,
        negative: theme.colors.negative,
        neutral: theme.colors.neutral,
      },
    };

    expect(ThemeSchema.safeParse(withoutRadii).success).toBe(false);
    expect(ThemeSchema.safeParse(withoutSurface).success).toBe(false);
  });

  test("rejects unknown fields at the root and inside token groups", async () => {
    const theme = ThemeSchema.parse(await readTheme());

    expect(
      ThemeSchema.safeParse({ ...theme, renderer: "playwright" }).success
    ).toBe(false);
    expect(
      ThemeSchema.safeParse({
        ...theme,
        colors: { ...theme.colors, chart: "#000000" },
      }).success
    ).toBe(false);
  });

  test("rejects empty or whitespace-only token values", async () => {
    const theme = ThemeSchema.parse(await readTheme());

    expect(
      ThemeSchema.safeParse({
        ...theme,
        typography: { ...theme.typography, fontBody: "" },
      }).success
    ).toBe(false);
    expect(
      ThemeSchema.safeParse({
        ...theme,
        colors: { ...theme.colors, positive: "   " },
      }).success
    ).toBe(false);
  });

  test("serializes canonical CSS variables in deterministic token order", async () => {
    const rawTheme = await readTheme();
    const expected = `:root {
  --color-background: #F7F3EA;
  --color-surface: #EFE8D9;
  --color-border: #D9D1C0;
  --color-text-primary: #26241E;
  --color-text-secondary: #5C574A;
  --color-positive: #1D4B38;
  --color-negative: #B4532A;
  --color-neutral: #8B8271;
  --font-display: "Cormorant Garamond", serif;
  --font-body: "Plus Jakarta Sans", sans-serif;
  --font-size-body: 16px;
  --font-size-label: 12px;
  --font-size-caption: 14px;
  --font-size-metric: 48px;
  --font-weight-semibold: 600;
  --line-height-body: 1.5;
  --line-height-label: 1.25;
  --line-height-tight: 1;
  --tracking-body: -0.01em;
  --tracking-heading: -0.02em;
  --tracking-label: -0.01em;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --border-width: 1px;
  --radius-card: 12px;
}`;

    expect(themeToCssVariables(rawTheme)).toBe(expected);
    expect(themeToCssVariables(rawTheme)).toBe(
      themeToCssVariables(structuredClone(rawTheme))
    );
  });
});
