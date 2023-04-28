import type { ResolvableHeaders } from './fetcher.js';
import { isPlainObject } from './utils.js';

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

export function hackyConvertDates(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(hackyConvertDates);
  }
  if (isPlainObject(val)) {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => {
        if (v && k.endsWith('Time')) {
          // regular ISO format
          if (typeof v === 'string' && v.length === 24 && v.endsWith('Z')) {
            return [k, new Date(v)];
          }
          // postgres-ish JSON format
          if (typeof v === 'string' && v.match(/\.[0-9]{3,6}$/)) {
            return [k, new Date(v)];
          }
          // eslint-disable-next-line no-console
          console.warn(
            `Unsupported Date format ${v} (${typeof v}) in key ${k}. Returning epoch`,
          );
          return [k, new Date(0)];
        }

        return [k, hackyConvertDates(v)];
      }),
    );
  }
  return val;
}
