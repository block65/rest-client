export function isPlainObject(
	value: unknown,
): value is Record<string, unknown> {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.getPrototypeOf({});
}

/**
 * Applies the toJSON hook the way JSON.stringify does. A value defining
 * toJSON supplies its wire form, and the caller encodes the result. Runs
 * once per position, so a toJSON returning `this` terminates
 */
export function toJsonValue(value: unknown): unknown {
	if (value === null || typeof value !== "object" || !("toJSON" in value)) {
		return value;
	}

	const { toJSON } = value;

	return typeof toJSON === "function" ? toJSON.call(value) : value;
}

export function jsonStringify(value: unknown) {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}
