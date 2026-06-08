import pRetry from "p-retry";
import type * as PRetry from "p-retry";
import type { Jsonifiable } from "type-fest";
import type { FetcherMethod, FetcherParams, FetcherResponse } from "../../lib/types.ts";

function multiSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();

  // eslint-disable-next-line no-restricted-syntax
  for (const signal of signals) {
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return signal;
      }

      signal.addEventListener("abort", () => controller.abort(signal.reason), {
        signal: controller.signal,
      });
    }
  }

  return controller.signal;
}

type IsomorphicFetcherResponse =
  | FetcherResponse<Jsonifiable>
  | FetcherResponse<ReadableStream<Uint8Array> | null>;

// transient statuses worth another attempt; everything else — ok or not —
// returns to the caller so error semantics never depend on retry config
const retryableStatuses = new Set([408, 425, 429]);

function isRetryableStatus(status: number): boolean {
  return status >= 500 || retryableStatuses.has(status);
}

// carries the parsed response through p-retry so exhausted retries can still
// resolve with the final response instead of a context-free error
class RetryableStatusError extends Error {
  public readonly response: IsomorphicFetcherResponse;

  constructor(response: IsomorphicFetcherResponse) {
    super(response.res.statusText || `http-${response.res.status}`);
    this.response = response;
  }
}

async function intoFetcherResponse(res: Response, url: URL): Promise<IsomorphicFetcherResponse> {
  const contentType = res.headers.get("content-type");
  // const contentLength = res.headers.get('content-length');

  // auto parse json
  if (contentType?.includes("/json")) {
    const responseJson = (await res.json()) as Jsonifiable;
    return {
      body: responseJson,
      url: res.url ? new URL(res.url) : url,
      res,
    } satisfies FetcherResponse<Jsonifiable>;
  }

  return {
    body: res.body,
    url: res.url ? new URL(res.url) : url,
    res,
  } satisfies FetcherResponse<ReadableStream<Uint8Array> | null>;
}

export function createIsomorphicNativeFetcher(
  options: Omit<RequestInit, "method" | "body" | "signal"> & {
    fetch?: typeof globalThis.fetch;
    timeout?: number;
    retry?: PRetry.Options;
  } = {},
): FetcherMethod {
  return async (params: FetcherParams) => {
    const { url, method, body = null, headers, credentials, signal } = params;
    const { fetch = globalThis.fetch, ...rest } = options;

    const combinedSignal = multiSignal(
      signal,
      rest.retry?.signal,
      typeof rest.timeout !== "undefined" ? AbortSignal.timeout(rest.timeout) : undefined,
    );

    return pRetry(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_attempt: number) => {
        const finalBody = body instanceof Uint8Array ? body.slice().buffer : body;

        const res = await fetch(url, {
          // overridable
          ...(credentials && { credentials }),
          ...rest,

          // combined
          headers: {
            ...rest.headers,
            ...headers,
          },
          signal: combinedSignal,

          // not overridable
          method,
          body: finalBody,
        });

        const response = await intoFetcherResponse(res, url);

        // transient failures throw a plain error so p-retry re-attempts them
        if (!res.ok && isRetryableStatus(res.status)) {
          throw new RetryableStatusError(response);
        }

        return response;
      },
      method === "get"
        ? ({
            retries: 3, // default
            onFailedAttempt() {
              combinedSignal.throwIfAborted();
            },
            ...rest.retry,
            signal: combinedSignal,
          } as PRetry.Options)
        : ({
            ...rest.retry,
            retries: 0,
            signal: combinedSignal,
          } as PRetry.Options),
    ).catch((err: unknown) => {
      // retries exhausted — resolve with the final response so non-ok
      // handling stays the caller's job, with or without retry config
      if (err instanceof RetryableStatusError) {
        return err.response;
      }
      throw err;
    });
  };
}
