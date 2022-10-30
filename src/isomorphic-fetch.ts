import ky from 'ky-universal';
import type { FetcherParams, FetcherResponse } from '../lib/fetcher.js';
import { parse } from '@hapi/bourne';

export async function isomorphicFetcher<T>(
  params: FetcherParams,
): Promise<FetcherResponse<T>> {
  const { url, method, body, headers, credentials, signal } = params;

  const res = await ky(url, {
    method,
    throwHttpErrors: false,
    ...(headers && { headers }),
    ...(credentials && { credentials }),
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
}
