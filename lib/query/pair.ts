import { isPlainObject, toJsonValue } from "../utils.ts";

// unencoded, since the serializer applies RFC 3986 once to every pair alike
export type Pair = readonly [name: string, value: string];

/**
 * A plain object skips toJSON, which is a legal member name in a query object
 */
export function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

/**
 * A Blob, a ReadableStream or a toJSON-less class instance supplies toString
 */
export function scalar(name: string, value: unknown) {
	return [name, String(value)] as const;
}
