import { z } from "zod";

const FORBIDDEN_CSS_TOKEN_PATTERN =
  /[;{}\\\r\n]|(?:@import|javascript\s*:|url\s*\(|(?:-webkit-)?image-set\s*\(|\bimage\s*\()/iu;
const ThemeTokenValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(256)
  .refine((value) => !FORBIDDEN_CSS_TOKEN_PATTERN.test(value), {
    message: "Theme token must be a single network-free CSS value.",
  });

const ThemeColorsSchema = z.strictObject({
  background: ThemeTokenValueSchema,
  surface: ThemeTokenValueSchema,
  border: ThemeTokenValueSchema,
  textPrimary: ThemeTokenValueSchema,
  textSecondary: ThemeTokenValueSchema,
  positive: ThemeTokenValueSchema,
  negative: ThemeTokenValueSchema,
  neutral: ThemeTokenValueSchema,
});

const ThemeTypographySchema = z.strictObject({
  fontDisplay: ThemeTokenValueSchema,
  fontBody: ThemeTokenValueSchema,
  fontSizeBody: ThemeTokenValueSchema,
  fontSizeLabel: ThemeTokenValueSchema,
  fontSizeCaption: ThemeTokenValueSchema,
  fontSizeMetric: ThemeTokenValueSchema,
  fontWeightSemibold: ThemeTokenValueSchema,
  lineHeightBody: ThemeTokenValueSchema,
  lineHeightLabel: ThemeTokenValueSchema,
  lineHeightTight: ThemeTokenValueSchema,
  trackingBody: ThemeTokenValueSchema,
  trackingHeading: ThemeTokenValueSchema,
  trackingLabel: ThemeTokenValueSchema,
});

const ThemeSpacingSchema = z.strictObject({
  space3: ThemeTokenValueSchema,
  space4: ThemeTokenValueSchema,
  space6: ThemeTokenValueSchema,
  space8: ThemeTokenValueSchema,
});

const ThemeBordersSchema = z.strictObject({
  width: ThemeTokenValueSchema,
});

const ThemeRadiiSchema = z.strictObject({
  card: ThemeTokenValueSchema,
});

export const ThemeSchema = z.strictObject({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  colors: ThemeColorsSchema,
  typography: ThemeTypographySchema,
  spacing: ThemeSpacingSchema,
  borders: ThemeBordersSchema,
  radii: ThemeRadiiSchema,
});

export type Theme = z.infer<typeof ThemeSchema>;

export function themeToCssVariables(input: unknown): string {
  const theme = ThemeSchema.parse(input);
  const declarations = [
    ["--color-background", theme.colors.background],
    ["--color-surface", theme.colors.surface],
    ["--color-border", theme.colors.border],
    ["--color-text-primary", theme.colors.textPrimary],
    ["--color-text-secondary", theme.colors.textSecondary],
    ["--color-positive", theme.colors.positive],
    ["--color-negative", theme.colors.negative],
    ["--color-neutral", theme.colors.neutral],
    ["--font-display", theme.typography.fontDisplay],
    ["--font-body", theme.typography.fontBody],
    ["--font-size-body", theme.typography.fontSizeBody],
    ["--font-size-label", theme.typography.fontSizeLabel],
    ["--font-size-caption", theme.typography.fontSizeCaption],
    ["--font-size-metric", theme.typography.fontSizeMetric],
    ["--font-weight-semibold", theme.typography.fontWeightSemibold],
    ["--line-height-body", theme.typography.lineHeightBody],
    ["--line-height-label", theme.typography.lineHeightLabel],
    ["--line-height-tight", theme.typography.lineHeightTight],
    ["--tracking-body", theme.typography.trackingBody],
    ["--tracking-heading", theme.typography.trackingHeading],
    ["--tracking-label", theme.typography.trackingLabel],
    ["--space-3", theme.spacing.space3],
    ["--space-4", theme.spacing.space4],
    ["--space-6", theme.spacing.space6],
    ["--space-8", theme.spacing.space8],
    ["--border-width", theme.borders.width],
    ["--radius-card", theme.radii.card],
  ];
  const body = declarations
    .map(([variable, value]) => `  ${variable}: ${value};`)
    .join("\n");

  return `:root {\n${body}\n}`;
}
