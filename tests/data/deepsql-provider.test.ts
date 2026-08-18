import { afterEach, describe, expect, test } from "bun:test";
import { DeepSqlProvider } from "../../src/data/providers/deepsql.js";

const servers: Array<ReturnType<typeof Bun.serve>> = [];

const validRequest = {
  schemaVersion: "1",
  operation: "query",
  mode: "read-only",
  queryId: "monthly-revenue",
};

const validResponse = {
  schemaVersion: "1",
  mode: "read-only",
  snapshotId: "snapshot-2026-08-17",
  columns: [
    { name: "region", type: "string" },
    { name: "revenue", type: "number" },
  ],
  rows: [["south", 1250.5]],
  provenance: {
    sourceRef: "deepsql/reports/monthly-revenue",
    freshnessAt: "2026-08-17T10:30:00+00:00",
    queryId: "monthly-revenue",
  },
};

function startServer(
  handler: (request: Request) => Response | Promise<Response>
): ReturnType<typeof Bun.serve> {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: handler,
  });
  servers.push(server);
  return server;
}

function endpoint(server: ReturnType<typeof Bun.serve>, path = "/deep/sql") {
  return new URL(path, server.url).toString();
}

async function rejectionOf(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    throw new Error("Expected rejection to be an Error.");
  }
  throw new Error("Expected operation to reject.");
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)));
});

describe("DeepSqlProvider", () => {
  test("posts the exact read-only contract to the fixed endpoint and returns a canonical frozen snapshot", async () => {
    let received:
      | Readonly<{
          url: string;
          method: string;
          authorization: string | null;
          contentType: string | null;
          accept: string | null;
          body: unknown;
        }>
      | undefined;
    const server = startServer(async (request) => {
      received = {
        url: request.url,
        method: request.method,
        authorization: request.headers.get("authorization"),
        contentType: request.headers.get("content-type"),
        accept: request.headers.get("accept"),
        body: await request.json(),
      };
      return Response.json(validResponse);
    });
    const baseUrl = endpoint(server);
    const provider = new DeepSqlProvider({
      baseUrl,
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });

    const snapshot = await provider.load(validRequest, {
      signal: new AbortController().signal,
    });

    expect(provider.id).toBe("deepsql");
    expect(received).toEqual({
      url: baseUrl,
      method: "POST",
      authorization: "Bearer host-owned-token",
      contentType: "application/json",
      accept: "application/json",
      body: validRequest,
    });
    expect(snapshot).toEqual({
      schemaVersion: "1",
      snapshotId: validResponse.snapshotId,
      providerId: "deepsql",
      sourceRef: validResponse.provenance.sourceRef,
      mode: "read-only",
      capturedAt: validResponse.provenance.freshnessAt,
      columns: validResponse.columns,
      rows: validResponse.rows,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.columns)).toBe(true);
    expect(Object.isFrozen(snapshot.columns[0])).toBe(true);
    expect(Object.isFrozen(snapshot.rows)).toBe(true);
    expect(Object.isFrozen(snapshot.rows[0])).toBe(true);
  });

  test("rejects query IDs outside a cloned host allowlist before network access", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const allowedQueryIds = ["monthly-revenue"];
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds,
    });
    allowedQueryIds.splice(0, 1, "document-injected-query");

    await expect(
      provider.load(
        { ...validRequest, queryId: "document-injected-query" },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow("DeepSQL query is not allowed.");
    expect(requestCount).toBe(0);
  });

  test("rejects duplicate query IDs in trusted configuration", () => {
    expect(
      () =>
        new DeepSqlProvider({
          baseUrl: "https://example.test/deep/sql",
          authToken: "host-owned-token",
          timeoutMs: 1_000,
          allowedQueryIds: ["monthly-revenue", "monthly-revenue"],
        })
    ).toThrow("Invalid DeepSQL provider configuration.");
  });

  test("requires host policy for nonempty parameters before network access", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });

    await expect(
      provider.load(
        { ...validRequest, parameters: { region: "south" } },
        { signal: new AbortController().signal }
      )
    ).rejects.toThrow("DeepSQL parameters require host policy approval.");
    expect(requestCount).toBe(0);
  });

  test("invokes host parameter policy with safe immutable parsed data", async () => {
    const server = startServer(() => Response.json(validResponse));
    let receivedQueryId: string | undefined;
    let receivedParameters: Readonly<Record<string, unknown>> | undefined;
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
      validateParameters(queryId, parameters) {
        receivedQueryId = queryId;
        receivedParameters = parameters;
        return true;
      },
    });

    await provider.load(
      { ...validRequest, parameters: { region: "south", month: 8 } },
      { signal: new AbortController().signal }
    );

    expect(receivedQueryId).toBe("monthly-revenue");
    expect(receivedParameters).toEqual({ region: "south", month: 8 });
    expect(Object.isFrozen(receivedParameters)).toBe(true);
  });

  test("sanitizes host parameter policy rejection and failure before network access", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const authToken = "host-token-must-not-leak";
    const parameterValue = "parameter-value-must-not-leak";
    const policySecret = "policy-cause-must-not-leak";
    const policies = [
      () => false,
      () => {
        throw new Error(policySecret);
      },
    ];

    for (const validateParameters of policies) {
      const provider = new DeepSqlProvider({
        baseUrl: endpoint(server),
        authToken,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
        validateParameters,
      });
      const rejection = await rejectionOf(() =>
        provider.load(
          { ...validRequest, parameters: { region: parameterValue } },
          { signal: new AbortController().signal }
        )
      );

      expect(rejection.message).toBe(
        "DeepSQL parameter policy rejected the request."
      );
      expect(rejection.message).not.toContain(authToken);
      expect(rejection.message).not.toContain(parameterValue);
      expect(rejection.message).not.toContain(policySecret);
    }
    expect(requestCount).toBe(0);
  });

  test("strictly rejects mutating, raw SQL, endpoint, and auth request controls before network access", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });
    const sensitiveValue = "request-control-value-must-not-leak";
    const invalidRequests = [
      { ...validRequest, operation: "update" },
      { ...validRequest, mode: "read-write" },
      { ...validRequest, sql: sensitiveValue },
      { ...validRequest, endpoint: sensitiveValue },
      { ...validRequest, auth: sensitiveValue },
      { ...validRequest, token: sensitiveValue },
    ];

    for (const request of invalidRequests) {
      const rejection = await rejectionOf(() =>
        provider.load(request, { signal: new AbortController().signal })
      );
      expect(rejection.message).toBe("Invalid DeepSQL request.");
      expect(rejection.message).not.toContain(sensitiveValue);
    }
    expect(requestCount).toBe(0);
  });

  test("preserves an external pre-abort reason without making a request", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });
    const controller = new AbortController();
    const reason = new DOMException("cancelled by host", "AbortError");
    controller.abort(reason);

    await expect(
      provider.load(validRequest, { signal: controller.signal })
    ).rejects.toBe(reason);
    expect(requestCount).toBe(0);
  });

  test("times out a pending async parameter policy before network access with a sanitized error", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const authToken = "policy-timeout-token-must-not-leak";
    const parameterValue = "policy-timeout-parameter-must-not-leak";
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken,
      timeoutMs: 20,
      allowedQueryIds: ["monthly-revenue"],
      validateParameters: () => new Promise<boolean>(() => {}),
    });

    const rejection = await rejectionOf(() =>
      provider.load(
        { ...validRequest, parameters: { region: parameterValue } },
        { signal: new AbortController().signal }
      )
    );

    expect(rejection.message).toBe("DeepSQL request timed out.");
    expect(rejection.message).not.toContain(authToken);
    expect(rejection.message).not.toContain(parameterValue);
    expect(requestCount).toBe(0);
  }, 1_000);

  test("preserves an external abort reason while an async parameter policy is pending without network access", async () => {
    let requestCount = 0;
    const server = startServer(() => {
      requestCount += 1;
      return Response.json(validResponse);
    });
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
      validateParameters: () => new Promise<boolean>(() => {}),
    });
    const controller = new AbortController();
    const reason = new DOMException("cancelled by host", "AbortError");
    setTimeout(() => controller.abort(reason), 20);

    await expect(
      provider.load(
        { ...validRequest, parameters: { region: "south" } },
        { signal: controller.signal }
      )
    ).rejects.toBe(reason);
    expect(requestCount).toBe(0);
  }, 1_000);

  test("times out delayed HTTP acquisition with a sanitized error", async () => {
    const server = startServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return Response.json(validResponse);
    });
    const authToken = "timeout-token-must-not-leak";
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken,
      timeoutMs: 20,
      allowedQueryIds: ["monthly-revenue"],
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, {
        signal: new AbortController().signal,
      })
    );

    expect(rejection.message).toBe("DeepSQL request timed out.");
    expect(rejection.message).not.toContain(authToken);
  });

  test("rejects non-2xx responses with status-only diagnostics", async () => {
    const responseBody = "upstream-body-must-not-leak";
    const server = startServer(
      () =>
        new Response(responseBody, {
          status: 503,
          headers: { "Content-Type": "text/plain" },
        })
    );
    const authToken = "status-token-must-not-leak";
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken,
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, {
        signal: new AbortController().signal,
      })
    );

    expect(rejection.message).toBe("DeepSQL request failed with status 503.");
    expect(rejection.message).not.toContain(authToken);
    expect(rejection.message).not.toContain(responseBody);
    expect(rejection.message).not.toContain(endpoint(server));
  });

  test("rejects non-JSON content types without consuming or exposing the body", async () => {
    const responseBody = '{"secret":"wrong-content-type-body-must-not-leak"}';
    const server = startServer(
      () =>
        new Response(responseBody, {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
    );
    const authToken = "content-type-token-must-not-leak";
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken,
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, {
        signal: new AbortController().signal,
      })
    );

    expect(rejection.message).toBe("DeepSQL response must be JSON.");
    expect(rejection.message).not.toContain(authToken);
    expect(rejection.message).not.toContain(responseBody);
  });

  test("rejects oversized Content-Length before buffering the response", async () => {
    const responseBody = JSON.stringify({
      ...validResponse,
      rows: [["x".repeat(512), 1250.5]],
    });
    const server = startServer(
      () =>
        new Response(responseBody, {
          headers: { "Content-Type": "application/json" },
        })
    );
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "host-owned-token",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
      maxResponseBytes: 128,
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, {
        signal: new AbortController().signal,
      })
    );

    expect(rejection.message).toBe(
      "DeepSQL response exceeds maximum size."
    );
    expect(rejection.message).not.toContain(responseBody);
  });

  test("rejects chunked responses that exceed the byte ceiling while streaming", async () => {
    const chunk = "x".repeat(96);
    const server = startServer(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(chunk));
              controller.enqueue(new TextEncoder().encode(chunk));
              controller.close();
            },
          }),
          { headers: { "Content-Type": "application/json" } }
        )
    );
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "stream-token-must-not-leak",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
      maxResponseBytes: 128,
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, { signal: new AbortController().signal })
    );

    expect(rejection.message).toBe("DeepSQL response exceeds maximum size.");
    expect(rejection.message).not.toContain(chunk);
    expect(rejection.message).not.toContain("stream-token-must-not-leak");
  });

  test("sanitizes malformed JSON without exposing response bytes", async () => {
    const malformedBody = '{"secret":"body-must-not-leak"';
    const server = startServer(
      () =>
        new Response(malformedBody, {
          headers: { "Content-Type": "application/json" },
        })
    );
    const provider = new DeepSqlProvider({
      baseUrl: endpoint(server),
      authToken: "json-token-must-not-leak",
      timeoutMs: 1_000,
      allowedQueryIds: ["monthly-revenue"],
    });

    const rejection = await rejectionOf(() =>
      provider.load(validRequest, { signal: new AbortController().signal })
    );

    expect(rejection.message).toBe("DeepSQL response contains invalid JSON.");
    expect(rejection.message).not.toContain(malformedBody);
    expect(rejection.message).not.toContain("json-token-must-not-leak");
  });

  test("sanitizes contract-invalid responses and rejects mismatched query provenance", async () => {
    const responses = [
      {
        body: { ...validResponse, credentials: "response-secret" },
        expected: "DeepSQL response failed contract validation.",
      },
      {
        body: {
          ...validResponse,
          provenance: {
            ...validResponse.provenance,
            queryId: "different-allowlisted-query",
          },
        },
        expected: "DeepSQL response query ID does not match the request.",
      },
    ];

    for (const scenario of responses) {
      const server = startServer(() => Response.json(scenario.body));
      const provider = new DeepSqlProvider({
        baseUrl: endpoint(server),
        authToken: "contract-token-must-not-leak",
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      });
      const rejection = await rejectionOf(() =>
        provider.load(validRequest, { signal: new AbortController().signal })
      );
      expect(rejection.message).toBe(scenario.expected);
      expect(rejection.message).not.toContain("response-secret");
      expect(rejection.message).not.toContain("contract-token-must-not-leak");
    }
  });

  test("fails closed on invalid trusted configuration without echoing secrets", () => {
    const secret = "configuration-token-must-not-leak";
    const invalidConfigurations = [
      {
        baseUrl: "ftp://example.test/deep/sql",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://user:password@example.test/deep/sql",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql?endpoint=document-controlled",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: "   ",
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: "unsafe\r\nheader",
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: secret,
        timeoutMs: 0,
        allowedQueryIds: ["monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: [],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue", "monthly-revenue"],
      },
      {
        baseUrl: "https://example.test/deep/sql",
        authToken: secret,
        timeoutMs: 1_000,
        allowedQueryIds: ["monthly-revenue"],
        maxResponseBytes: 5_242_881,
      },
    ];

    for (const config of invalidConfigurations) {
      let rejection: Error | undefined;
      try {
        new DeepSqlProvider(config);
      } catch (error) {
        rejection = error instanceof Error ? error : undefined;
      }
      expect(rejection?.message).toBe("Invalid DeepSQL provider configuration.");
      expect(rejection?.message).not.toContain(secret);
    }
  });
});
