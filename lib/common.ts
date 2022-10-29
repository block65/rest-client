import { isPlainObject } from '../lib/utils.js';

export function hackyConvertDates(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(hackyConvertDates);
  }
  if (isPlainObject(val)) {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => {
        if (v && k.endsWith('Time')) {
          if (typeof v === 'string' && v.length === 24) {
            return [k, new Date(v)];
          }
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
