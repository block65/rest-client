import type { JsonPrimitive, Simplify, UnknownRecord } from "type-fest";

export function isPlainObject(value: unknown): value is UnknownRecord {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.getPrototypeOf({});
}

type Jsonifiable<T extends JsonPrimitive = JsonPrimitive> = { toJSON(): T };

function isJsonifiable(value: unknown): value is Jsonifiable {
	return (
		typeof value === "object" &&
		value !== null &&
		"toJSON" in value &&
		typeof value.toJSON === "function"
	);
}

export function maybeToJson<T>(value: T) {
	return isJsonifiable(value) ? value.toJSON() : value;
}

type Stringifiable = { toString(): string };

// `Object`'s own `toString` yields "[object Object]"
function isStringifiable(value: unknown): value is Stringifiable {
	return (
		typeof value === "object" &&
		value !== null &&
		value.toString !== Object.prototype.toString
	);
}

/**
 * An array stringifies too, as it overrides Object's `toString`
 */
export function stringifyScalar(value: unknown): string | undefined {
	switch (true) {
		case typeof value === "string":
			return value;
		case typeof value === "number":
		case typeof value === "boolean":
		case typeof value === "bigint":
			return value.toString();
		case isStringifiable(value):
			return value.toString();
		default:
			return;
	}
}

/**
 * JSON.stringify that writes a bigint as its decimal string instead of
 * throwing
 */
export function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}

export type WithoutUndefinedProperties<T extends object> = Simplify<{
	[P in keyof T]: Exclude<T[P], undefined>;
}>;

export type OptionalToUndefined<T extends object> = {
	[P in keyof T]: undefined extends T[P] ? T[P] | undefined : T[P];
};

export function stripUndefined<T extends object>(obj: OptionalToUndefined<T>) {
	const kept = Object.entries(obj).filter(([, v]) => v !== undefined);

	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries returns an index signature, never the mapped type
	return Object.fromEntries(kept) as WithoutUndefinedProperties<T>;
}
