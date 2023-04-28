import { parse } from '@hapi/bourne';
import ky, { type Options } from 'ky-universal';
import type { Jsonifiable } from 'type-fest';
import type {
  FetcherMethod,
  FetcherParams,
  FetcherResponse,
} from '../lib/types.js';

export function createIsomorphicFetcher(
  options: Omit<Options, 'method' | 'json' | 'parseJson' | 'signal'> = {},
): FetcherMethod {
  return async (params: FetcherParams) => {
    const { url, method, body, headers, credentials, signal } = params;

    const res = await ky(url, {
      // overridable
      throwHttpErrors: false,
      ...(credentials && { credentials }),

      ...options,

      // combined
      headers: {
        ...options.headers,
        ...headers,
      },

      // not overridable
      method,
      ...(!!body && { json: body }),
      ...(signal && { signal }),
      parseJson: parse,
    });

    const contentType = res.headers.get('content-type');

    // this can be replaced with any other way of detecting streaming
    const streaming = contentType === 'text/event-stream';

    if (!streaming) {
      const isJson = contentType?.includes('/json');

      const responseBody = await (isJson
        ? res.json<Jsonifiable>()
        : res.text());

      return {
        body: responseBody,
        url: new URL(res.url),
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      } satisfies FetcherResponse<Jsonifiable | string>;
    }

    return {
      body: res.body,
      url: new URL(res.url),
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    } satisfies FetcherResponse<ReadableStream<Uint8Array> | null>;
  };
}
