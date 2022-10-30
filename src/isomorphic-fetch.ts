import ky from 'ky-universal';
import type {
  FetcherParams,
  FetcherResponse,
  ResolvableHeaders,
} from '../lib/fetcher.js';

async function resolveHeaders(
  headers: ResolvableHeaders | undefined,
): Promise<Record<string, string | undefined>> {
  if (!headers) {
    return {};
  }

  return Object.fromEntries(
    await Promise.all(
      Object.entries(headers).map(
        async ([key, value]): Promise<[string, string]> => [
          key,
          value instanceof Function ? await value() : value,
        ],
      ),
    ),
  );
}
import { parse } from '@hapi/bourne';

export async function isomorphicFetcher<T>(
  params: FetcherParams,
): Promise<FetcherResponse<T>> {
  const { url, method, body, headers, credentials, signal } = params;

  const resolvedHeaders = await resolveHeaders(headers);

  const res = await ky(url, {
    method,
    throwHttpErrors: false,
    ...(resolvedHeaders && { headers: resolvedHeaders }),
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
