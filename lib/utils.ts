import type { Entries, JsonPrimitive, UnknownRecord } from "type-fest";

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

// Object's own toString yields "[object Object]", which says nothing
function isStringifiable(value: unknown): value is Stringifiable {
	return (
		typeof value === "object" &&
		value !== null &&
		value.toString !== Object.prototype.toString
	);
}

/**
 * A primitive stringifies, and so does a class that overrides `toString`.
 * The caller decides what undefined means where it stands
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
 * Used by the generated `Command`s
 *
 * @param value The value to be JSON stringified.
 * @returns The JSON string representation of the value
 */
export function jsonStringify(value: unknown): string {
	return JSON.stringify(value, (_key, val) =>
		typeof val === "bigint" ? val.toString() : val,
	);
}

export function typedObjectEntries<T extends UnknownRecord>(obj: T) {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- its the entire point on this fn
	return Object.entries(obj) as Entries<T>;
}
