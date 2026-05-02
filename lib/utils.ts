export function isPlainObject<T extends Record<string, unknown>>(value: unknown | T): value is T {
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.getPrototypeOf({});
}

export function withNullProto<T extends Record<string | number, unknown>>(obj: T): T {
  return Object.assign<T, T>(Object.create(null), obj);
}
