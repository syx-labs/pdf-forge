import { z } from "zod";
import { DEFAULT_DATA_LIMITS } from "../limits.js";
import type { DataProvider, DataProviderLoadContext } from "../provider.js";
import { parseDataSnapshot } from "../schemas.js";
import type { DataScalar, DataSnapshot } from "../types.js";
import {
  parseDeepSqlRequest,
  parseDeepSqlResponse,
} from "./deepsql-contract.js";

const MAX_TIMEOUT_MS = 120_000;
const MAX_AUTH_TOKEN_LENGTH = 8_192;
const MAX_ALLOWED_QUERY_IDS = 256;
const SAFE_QUERY_ID_PATTERN = /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/;

export type DeepSqlParameters = Readonly<Record<string, DataScalar>>;
export type DeepSqlParameterValidator = (
  queryId: string,
  parameters: DeepSqlParameters
) => boolean | Promise<boolean>;
export type DeepSqlFreshnessValidator = (
  freshnessAt: string,
  queryId: string,
  sourceRef: string
) => boolean | Promise<boolean>;

function containsHttpHeaderControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
      return true;
    }
  }
  return false;
}

function isFixedHttpEndpoint(value: string): boolean {
  if (value.trim() !== value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname.length > 0 &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

const DeepSqlProviderConfigSchema = z
  .strictObject({
    baseUrl: z.string().min(1).max(4_096).refine(isFixedHttpEndpoint),
    authToken: z
      .string()
      .min(1)
      .max(MAX_AUTH_TOKEN_LENGTH)
      .refine((token) => token.trim().length > 0)
      .refine((token) => !containsHttpHeaderControl(token)),
    timeoutMs: z.number().int().min(1).max(MAX_TIMEOUT_MS),
    allowedQueryIds: z
      .array(
        z
          .string()
          .min(1)
          .max(128)
          .regex(SAFE_QUERY_ID_PATTERN)
      )
      .min(1)
      .max(MAX_ALLOWED_QUERY_IDS)
      .refine((ids) => new Set(ids).size === ids.length)
      .readonly(),
    maxResponseBytes: z
      .number()
      .int()
      .min(1)
      .max(DEFAULT_DATA_LIMITS.maxEncodedBytes)
      .optional(),
    validateParameters: z
      .custom<DeepSqlParameterValidator>(
        (value) => value === undefined || typeof value === "function"
      )
      .optional(),
    validateFreshness: z.custom<DeepSqlFreshnessValidator>(
      (value) => typeof value === "function"
    ),
  })
  .readonly();

export type DeepSqlProviderConfig = z.input<
  typeof DeepSqlProviderConfigSchema
>;

class DeepSqlProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepSqlProviderError";
  }
}

async function raceWithAbort<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  signal.throwIfAborted();
  let rejectAbort: ((reason: unknown) => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const onAbort = () => rejectAbort?.(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function rejectResponseBody(response: Response): Promise<void> {
  await response.body
    ?.cancel("DeepSQL response rejected.")
    .catch(() => undefined);
}

function readDeclaredContentLength(response: Response): number | undefined {
  const rawLength = response.headers.get("content-length");
  if (rawLength === null || !/^\d+$/u.test(rawLength)) {
    return undefined;
  }
  const length = Number(rawLength);
  return Number.isSafeInteger(length) ? length : undefined;
}

async function readBoundedResponseJson(
  response: Response,
  maxResponseBytes: number,
  signal: AbortSignal
): Promise<unknown> {
  const declaredLength = readDeclaredContentLength(response);
  if (declaredLength !== undefined && declaredLength > maxResponseBytes) {
    await rejectResponseBody(response);
    throw new DeepSqlProviderError(
      "DeepSQL response exceeds maximum size."
    );
  }

  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new DeepSqlProviderError("DeepSQL response contains invalid JSON.");
  }
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    signal.throwIfAborted();
    const result = await reader.read();
    if (result.done) {
      break;
    }
    totalBytes += result.value.byteLength;
    if (totalBytes > maxResponseBytes) {
      await reader.cancel("DeepSQL response exceeds maximum size.").catch(
        () => undefined
      );
      throw new DeepSqlProviderError(
        "DeepSQL response exceeds maximum size."
      );
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const decoded: unknown = JSON.parse(text);
    return decoded;
  } catch {
    throw new DeepSqlProviderError("DeepSQL response contains invalid JSON.");
  }
}

export class DeepSqlProvider implements DataProvider {
  readonly id = "deepsql";
  readonly #baseUrl: string;
  readonly #authToken: string;
  readonly #timeoutMs: number;
  readonly #allowedQueryIds: ReadonlySet<string>;
  readonly #maxResponseBytes: number;
  readonly #validateParameters: DeepSqlParameterValidator | undefined;
  readonly #validateFreshness: DeepSqlFreshnessValidator;

  constructor(config: DeepSqlProviderConfig) {
    const parsed = DeepSqlProviderConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error("Invalid DeepSQL provider configuration.");
    }
    this.#baseUrl = parsed.data.baseUrl;
    this.#authToken = parsed.data.authToken;
    this.#timeoutMs = parsed.data.timeoutMs;
    this.#allowedQueryIds = new Set(parsed.data.allowedQueryIds);
    this.#maxResponseBytes =
      parsed.data.maxResponseBytes ?? DEFAULT_DATA_LIMITS.maxEncodedBytes;
    this.#validateParameters = parsed.data.validateParameters;
    this.#validateFreshness = parsed.data.validateFreshness;
  }

  async load(
    request: unknown,
    context: DataProviderLoadContext
  ): Promise<DataSnapshot> {
    context.signal.throwIfAborted();
    let parsedRequest: ReturnType<typeof parseDeepSqlRequest>;
    try {
      parsedRequest = parseDeepSqlRequest(request);
    } catch {
      throw new Error("Invalid DeepSQL request.");
    }
    if (!this.#allowedQueryIds.has(parsedRequest.queryId)) {
      throw new Error("DeepSQL query is not allowed.");
    }

    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), this.#timeoutMs);
    const signal = AbortSignal.any([
      context.signal,
      timeoutController.signal,
    ]);
    try {
      const parameters = parsedRequest.parameters;
      if (parameters !== undefined && Object.keys(parameters).length > 0) {
        const validateParameters = this.#validateParameters;
        if (validateParameters === undefined) {
          throw new DeepSqlProviderError(
            "DeepSQL parameters require host policy approval."
          );
        }
        let approved: boolean;
        try {
          approved = await raceWithAbort(
            Promise.resolve(
              validateParameters(parsedRequest.queryId, parameters)
            ),
            signal
          );
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }
          throw new DeepSqlProviderError(
            "DeepSQL parameter policy rejected the request."
          );
        }
        if (approved !== true) {
          throw new DeepSqlProviderError(
            "DeepSQL parameter policy rejected the request."
          );
        }
      }

      signal.throwIfAborted();
      const response = await fetch(this.#baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.#authToken}`,
        },
        body: JSON.stringify(parsedRequest),
        redirect: "error",
        signal,
      });
      if (!response.ok) {
        await rejectResponseBody(response);
        throw new DeepSqlProviderError(
          `DeepSQL request failed with status ${response.status}.`
        );
      }
      const mediaType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
      if (mediaType !== "application/json") {
        await rejectResponseBody(response);
        throw new DeepSqlProviderError("DeepSQL response must be JSON.");
      }

      const decoded = await readBoundedResponseJson(
        response,
        this.#maxResponseBytes,
        signal
      );
      let parsedResponse: ReturnType<typeof parseDeepSqlResponse>;
      try {
        parsedResponse = parseDeepSqlResponse(decoded);
      } catch {
        throw new DeepSqlProviderError(
          "DeepSQL response failed contract validation."
        );
      }
      if (parsedResponse.provenance.queryId !== parsedRequest.queryId) {
        throw new DeepSqlProviderError(
          "DeepSQL response query ID does not match the request."
        );
      }
      let fresh: boolean;
      try {
        fresh = await raceWithAbort(
          Promise.resolve(
            this.#validateFreshness(
              parsedResponse.provenance.freshnessAt,
              parsedResponse.provenance.queryId,
              parsedResponse.provenance.sourceRef
            )
          ),
          signal
        );
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        throw new DeepSqlProviderError(
          "DeepSQL freshness policy rejected the response."
        );
      }
      if (fresh !== true) {
        throw new DeepSqlProviderError(
          "DeepSQL freshness policy rejected the response."
        );
      }

      return parseDataSnapshot({
        schemaVersion: "1",
        snapshotId: parsedResponse.snapshotId,
        providerId: this.id,
        sourceRef: parsedResponse.provenance.sourceRef,
        mode: "read-only",
        capturedAt: parsedResponse.provenance.freshnessAt,
        columns: parsedResponse.columns,
        rows: parsedResponse.rows,
      });
    } catch (error) {
      if (context.signal.aborted) {
        throw context.signal.reason;
      }
      if (timeoutController.signal.aborted) {
        throw new Error("DeepSQL request timed out.");
      }
      if (error instanceof DeepSqlProviderError) {
        throw error;
      }
      throw new Error("DeepSQL acquisition failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}
