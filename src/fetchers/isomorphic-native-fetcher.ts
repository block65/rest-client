import { parse } from '@hapi/bourne';
import pRetry, { AbortError } from 'p-retry';
import type * as PRetry from 'p-retry';
import type { Jsonifiable } from 'type-fest';
import type { FetcherMethod, FetcherParams } from '../../lib/types.js';

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
    timeout?: number;
    retry?: PRetry.Options;
  } = {},
): FetcherMethod {
  return async (params: FetcherParams) => {
    const { url, method, body = null, headers, credentials, signal } = params;

    const combinedSignal = multiSignal(
      signal,
      options.retry?.signal,
      typeof options.timeout !== 'undefined'
        ? AbortSignal.timeout(options.timeout)
        : undefined,
    );

    return pRetry(
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

        if (!streaming) {
          const isJson = contentType?.includes('/json');

          const responseBody = await (isJson
            ? res.text().then<Jsonifiable>(parse)
            : res.text());

          return {
            body: responseBody,
            url: new URL(res.url),
            status: res.status,
            statusText: res.statusText,
            ok: res.ok,
          }; // satisfies FetcherResponse<Jsonifiable | string>;
        }

        return {
          body: res.body,
          url: new URL(res.url),
          status: res.status,
          statusText: res.statusText,
          ok: res.ok,
        }; // satisfies FetcherResponse<ReadableStream<Uint8Array> | null>;
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
