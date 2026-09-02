export function isPlainObject<T extends Record<string, unknown>>(
	value: unknown | T,
): value is T {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.getPrototypeOf({});
}

export function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}
