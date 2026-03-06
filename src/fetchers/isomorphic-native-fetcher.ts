import pRetry, { AbortError } from 'p-retry';
import type * as PRetry from 'p-retry';
import type { Jsonifiable } from 'type-fest';
import type {
  FetcherMethod,
  FetcherParams,
  FetcherResponse,
} from '../../lib/types.ts';

function multiSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const controller = new AbortController();

  // eslint-disable-next-line no-restricted-syntax
  for (const signal of signals) {
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        return signal;
      }

      signal.addEventListener('abort', () => controller.abort(signal.reason), {
        signal: controller.signal,
      });
    }
  }

  return controller.signal;
}

export function createIsomorphicNativeFetcher(
  options: Omit<RequestInit, 'method' | 'body' | 'signal'> & {
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
      typeof rest.timeout !== 'undefined'
        ? AbortSignal.timeout(rest.timeout)
        : undefined,
    );

    return pRetry(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_attempt: number) => {

        const finalBody = body instanceof Uint8Array
          ? body.slice().buffer
          : body;           

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
          body:finalBody,
        });

        // if we are set up for retries and the response is not ok, throw
        if (rest.retry && !res.ok) {
          throw new AbortError(res.statusText);
        }

        const contentType = res.headers.get('content-type');
        // const contentLength = res.headers.get('content-length');

        // auto parse json
        if (contentType?.includes('/json')) {
          const responseJson = await res.json() as Jsonifiable;
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
      },
      method === 'get'
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
    );
  };
}
