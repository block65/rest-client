import ky from 'ky-universal';
import type { FetcherParams, FetcherResponse } from '../lib/fetcher.js';

export async function isomorphicFetcher<T>(
  params: FetcherParams,
): Promise<FetcherResponse<T>> {
  const { url, method, body, headers, credentials, signal } = params;

  // const { keepAlive,  } = options;

  const res = await ky(url, {
    method,
    throwHttpErrors: false,
    ...(headers && { headers }),
    ...(credentials && { credentials }),
    ...(!!body && { json: body }),
    ...(signal && { signal }),
    // ...(keepAlive && { keepalive: keepAlive }),
  });

  return {
    body: await res.json<T>(),
    url: new URL(res.url),
    status: res.status,
    statusText: res.statusText,
    ok: res.ok,
  };
}
