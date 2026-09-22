import type { UnknownRecord } from "type-fest";

export function isPlainObject(value: unknown): value is UnknownRecord {
	if (Object.prototype.toString.call(value) !== "[object Object]") {
		return false;
	}

	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.getPrototypeOf({});
}

// the hook JSON.stringify honours, on a Date, a URL or a caller's own class
type JsonReady<T> = { toJSON(): T };

type JsonValueOf<T> = T extends JsonReady<infer Json> ? Json : T;

function hasToJson(value: unknown): value is JsonReady<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"toJSON" in value &&
		typeof value.toJSON === "function"
	);
}

/**
 * Applies the toJSON hook the way JSON.stringify does. A value defining
 * toJSON supplies its wire form, and the caller encodes the result. Runs
 * once per position, so a toJSON returning `this` terminates
 */
export function toJsonValue<T>(value: T): JsonValueOf<T> {
	// the guard proves the branch, the conditional type only restates it
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- by design
	return (hasToJson(value) ? value.toJSON() : value) as JsonValueOf<T>;
}

type Stringifiable = { toString(): string };

/**
 * A URL, a Blob or a caller's own class states its string form this way.
 * Object's own toString does not count
 */
export function isStringifiable(value: unknown): value is Stringifiable {
	return (
		typeof value === "object" &&
		value !== null &&
		value.toString !== Object.prototype.toString
	);
}

export function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}

export function typedObjectEntries<T extends Record<string, unknown>>(
	obj: T,
): [keyof T, T[keyof T]][] {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its the entire point on this fn
	return Object.entries(obj) as [keyof T, T[keyof T]][];
}
