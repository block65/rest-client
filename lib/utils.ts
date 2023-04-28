import type { Resolver } from './types.js';

export function isPlainObject<T extends Record<string, unknown>>(
  value: unknown | T,
): value is T {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.getPrototypeOf({});
}

export function withNullProto<T extends Record<string | number, unknown>>(
  obj: T,
): T {
  return Object.assign<T, T>(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    Object.create(null),
    obj,
  );
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.entries(obj).reduce(
    (accum, [k, v]) =>
      typeof v === 'undefined'
        ? accum
        : { ...accum, [k]: isPlainObject(v) ? stripUndefined(v) : v },
    withNullProto({} as T),
  );
}

export function resolve<T>(val: Resolver<T>) {
  return Promise.resolve<T>(typeof val === 'function' ? val() : val);
}
