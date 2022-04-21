export function isPlainObject<T extends Record<string, unknown>>(
  value: unknown | T,
): value is T {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.getPrototypeOf({});
}

export function withNullProto<T extends Record<string | number, unknown>>(
  obj: T,
): T {
  return Object.assign(Object.create(null), obj);
}

export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.entries(obj).reduce(
    (accum, [k, v]) =>
      typeof v === 'undefined'
        ? accum
        : { ...accum, [k]: isPlainObject(v) ? stripUndefined(v) : v },
    withNullProto({} as T),
  );
}
