import { DEFAULT_DATA_LIMITS } from "../data/limits.js";
import { loadRegistry } from "../registry/loader.js";

const DEEPSQL_ENVIRONMENT_VARIABLES = {
  endpoint: "PDF_FORGE_DEEPSQL_BASE_URL",
  authToken: "PDF_FORGE_DEEPSQL_AUTH_TOKEN",
  allowlist: "PDF_FORGE_DEEPSQL_ALLOWED_QUERY_IDS",
  timeout: "PDF_FORGE_DEEPSQL_TIMEOUT_MS",
} as const;

export type EffectiveConfigEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type InspectEffectiveConfigOptions = Readonly<{
  packageRoot: string;
  environment?: EffectiveConfigEnvironment;
}>;

type ConfiguredEnvironment = Readonly<{
  endpoint: string | undefined;
  authToken: string | undefined;
  allowlist: string | undefined;
  timeout: string | undefined;
}>;

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidInspectionOptions(): never {
  throw new Error("Invalid effective config inspection options.");
}

function readOptionalEnvironmentString(
  environment: Readonly<Record<string, unknown>>,
  name: string
): string | undefined {
  const value = environment[name];
  if (value !== undefined && typeof value !== "string") {
    return invalidInspectionOptions();
  }
  return value;
}

function cloneConfiguredEnvironment(environment: unknown): ConfiguredEnvironment {
  if (!isUnknownRecord(environment)) {
    return invalidInspectionOptions();
  }

  return Object.freeze({
    endpoint: readOptionalEnvironmentString(
      environment,
      DEEPSQL_ENVIRONMENT_VARIABLES.endpoint
    ),
    authToken: readOptionalEnvironmentString(
      environment,
      DEEPSQL_ENVIRONMENT_VARIABLES.authToken
    ),
    allowlist: readOptionalEnvironmentString(
      environment,
      DEEPSQL_ENVIRONMENT_VARIABLES.allowlist
    ),
    timeout: readOptionalEnvironmentString(
      environment,
      DEEPSQL_ENVIRONMENT_VARIABLES.timeout
    ),
  });
}

function parseInspectionOptions(input: unknown): Readonly<{
  packageRoot: string;
  configuredEnvironment: ConfiguredEnvironment;
}> {
  try {
    if (!isUnknownRecord(input)) {
      return invalidInspectionOptions();
    }
    const allowedKeys = new Set(["packageRoot", "environment"]);
    if (
      Reflect.ownKeys(input).some(
        (key) => typeof key !== "string" || !allowedKeys.has(key)
      )
    ) {
      return invalidInspectionOptions();
    }
    if (
      typeof input.packageRoot !== "string" ||
      input.packageRoot.trim().length === 0
    ) {
      return invalidInspectionOptions();
    }

    return Object.freeze({
      packageRoot: input.packageRoot,
      configuredEnvironment: cloneConfiguredEnvironment(
        input.environment === undefined ? process.env : input.environment
      ),
    });
  } catch {
    return invalidInspectionOptions();
  }
}

export async function inspectEffectiveConfig(
  options: InspectEffectiveConfigOptions
) {
  const { packageRoot, configuredEnvironment } = parseInspectionOptions(options);
  const registry = await loadRegistry(packageRoot).catch(() => {
    throw new Error("Failed to inspect registry configuration.");
  });
  const deepsqlProvider = Object.freeze({
    id: "deepsql" as const,
    enabled: false as const,
    configuration: Object.freeze({
      endpointConfigured: configuredEnvironment.endpoint !== undefined,
      authToken:
        configuredEnvironment.authToken === undefined
          ? null
          : ("[REDACTED]" as const),
      allowlistConfigured: configuredEnvironment.allowlist !== undefined,
      timeoutConfigured: configuredEnvironment.timeout !== undefined,
    }),
  });
  const staticJsonProvider = Object.freeze({
    id: "static-json" as const,
    enabled: true as const,
  });
  const providers = Object.freeze(
    [staticJsonProvider, deepsqlProvider].sort((left, right) =>
      left.id.localeCompare(right.id)
    )
  );

  return Object.freeze({
    schemaVersion: "1" as const,
    registry: Object.freeze({ version: registry.version }),
    limits: Object.freeze({
      maxRows: DEFAULT_DATA_LIMITS.maxRows,
      maxColumns: DEFAULT_DATA_LIMITS.maxColumns,
      maxEncodedBytes: DEFAULT_DATA_LIMITS.maxEncodedBytes,
    }),
    providers,
  });
}
