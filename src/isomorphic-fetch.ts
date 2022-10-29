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
    timeout: 10000,
  });

  return {
    body: await res.json<T>(),
    url: new URL(res.url),
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
  };
}
