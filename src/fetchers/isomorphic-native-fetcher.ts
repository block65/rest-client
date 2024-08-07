import { parse } from '@hapi/bourne';
import pRetry, { AbortError } from 'p-retry';
import type * as PRetry from 'p-retry';
import type { Jsonifiable } from 'type-fest';
import type {
  FetcherMethod,
  FetcherParams,
  FetcherResponse,
} from '../../lib/types.js';

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
    const { fetch = globalThis.fetch } = options;

    const combinedSignal = multiSignal(
      signal,
      options.retry?.signal,
      typeof options.timeout !== 'undefined'
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    );

    return pRetry(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (_attempt: number) => {
        const res = await fetch(url, {
          // overridable
          ...(credentials && { credentials }),
          ...options,

          // combined
          headers: {
            ...options.headers,
            ...headers,
          },
          signal: combinedSignal,

          // not overridable
          method,
          body,
        });

        // if we are set up for retries and the response is not ok, throw
        if (options.retry && !res.ok) {
          throw new AbortError(res.statusText);
        }

        const contentType = res.headers.get('content-type');
        const contentLength = res.headers.get('content-length');

        // this can be replaced with any other way of detecting streaming
        const streaming = !contentLength && contentType === 'text/event-stream';

        // not streaming and also has content
        if (!streaming && res.status !== 204) {
          const responseText = await res.text();

          // sanity check to ensure the body is not empty
          // lambda function URLs can return an empty body and still indicate
          // that content type is JSON.
          const isJson =
            responseText.length > 0 && contentType?.includes('/json');

          return {
            body: isJson ? (parse(responseText) as Jsonifiable) : responseText,
            url: new URL(res.url),
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
            headers: res.headers,
          } satisfies FetcherResponse<Jsonifiable | string>;
        }

        return {
          body: res.body,
          url: new URL(res.url),
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
          headers: res.headers,
        } satisfies FetcherResponse<ReadableStream<Uint8Array> | null>;
      },
      method === 'get'
        ? ({
            retries: 3, // default
            onFailedAttempt() {
              combinedSignal.throwIfAborted();
            },
            ...options.retry,
            signal: combinedSignal,
          } as PRetry.Options)
        : ({
            ...options.retry,
            retries: 0,
            forever: false,
            signal: combinedSignal,
          } as PRetry.Options),
    );
  };
}
