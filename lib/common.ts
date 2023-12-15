import type { ResolvableHeaders } from './types.js';

export async function resolveHeaders(
  headers: ResolvableHeaders | undefined,
): Promise<Record<string, string>> {
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
