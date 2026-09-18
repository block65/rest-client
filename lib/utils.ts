export function isPlainObject<T extends Record<string, unknown>>(
	value: unknown,
): value is T {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.getPrototypeOf({});
}

/**
 * The hook JSON.stringify itself honours, applied the same way: a value that
 * knows its own wire form supplies it, and the caller then encodes what comes
 * back. Consulted once per position - never again on the result - so a toJSON
 * that hands back `this` terminates, exactly as JSON.stringify's does.
 */
export function toJsonValue(value: unknown): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}

	const { toJSON } = value as { toJSON?: unknown };

	return typeof toJSON === "function"
		? (toJSON as (this: unknown) => unknown).call(value)
		: value;
}

export function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}
