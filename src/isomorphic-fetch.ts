import { parse } from '@hapi/bourne';
import ky, { Options } from 'ky-universal';
import type { FetcherParams, FetcherResponse } from '../lib/fetcher.js';

export function createIsomorphicFetcher(
  options: Omit<Options, 'method' | 'json' | 'parseJson' | 'signal'> = {},
) {
  return async function isomorphicFetcher<T>(
    params: FetcherParams,
  ): Promise<FetcherResponse<T>> {
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
    const isJson = contentType && contentType.startsWith('application/json');

    if (isJson) {
      // with ky, an empty string is returned on a 204
      const responseBody: T | '' = await res.json();

      return {
        ...(responseBody !== '' && { body: responseBody }),
        url: new URL(res.url),
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
      };
    }

    return {
      body: (await res.text()) as T,
      url: new URL(res.url),
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    };
  };
}
