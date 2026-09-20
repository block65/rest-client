import queryString, { type StringifyOptions } from "query-string";
import { isPlainObject, jsonStringify } from "./utils.ts";

// applied once per position, so a toJSON returning `this` terminates
function toJson(value: unknown) {
	if (value === null || typeof value !== "object" || !("toJSON" in value)) {
		return value;
	}

	const { toJSON } = value;

	return typeof toJSON === "function" ? toJSON.call(value) : value;
}

function queryValue(value: unknown) {
	const resolved = toJson(value);

	if (resolved === null || resolved === undefined) {
		return;
	}

	return isPlainObject(resolved) ? jsonStringify(resolved) : String(resolved);
}

function queryParts(value: unknown) {
	const resolved = toJson(value);

	return (Array.isArray(resolved) ? resolved : [resolved])
		.map(queryValue)
		.filter((part) => part !== undefined);
}

// query-string alphabetises every query unless sort is off
const options = { skipNull: true, sort: false } satisfies StringifyOptions;

// without explode, an object is one value of alternating names and values
function alternating(value: unknown) {
	return isPlainObject(value)
		? Object.entries(value).flatMap(([member, memberValue]) => {
				const part = queryValue(memberValue);

				// an omitted value takes its member name with it, or every pair
				// after it reads one position out
				return part === undefined ? [] : [member, part];
			})
		: queryParts(value);
}

// with explode, each object member becomes a parameter named by memberKey
function explode(
	query: Record<string, unknown>,
	memberKey: (name: string, member: string) => string,
) {
	return Object.fromEntries(
		Object.entries(query).flatMap(([name, value]) =>
			isPlainObject(value)
				? Object.entries(value).map(([member, memberValue]) => [
						memberKey(name, member),
						queryParts(memberValue),
					])
				: [[name, queryParts(value)]],
		),
	);
}

/**
 * Repeats a key per array item and omits null and undefined. An object writes
 * as JSON. The client writes a query this way unless the command names another
 * serializer
 */
export function searchParamsSerializer(query: Record<string, unknown>) {
	return queryString.stringify(query, {
		...options,
		arrayFormat: "none",
		replacer: (_key, value) => queryParts(value),
	});
}

/**
 * Each style follows OpenAPI 3.2,
 * https://spec.openapis.org/oas/v3.2.0.html#style-examples
 *
 * `form` with `explode`, the OAS default. An array repeats its key, and an
 * object hoists its members to parameters of their own, losing the parent name
 */
export function formSerializer(query: Record<string, unknown>) {
	return queryString.stringify(
		explode(query, (_name, member) => member),
		{ ...options, arrayFormat: "none" },
	);
}

// query-string's own encoder, so every style encodes a value the same way
function encodePart(part: string) {
	return encodeURIComponent(part).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

// query-string joins on one character, and spaceDelimited needs %20
function delimitedSerializer(delimiter: string) {
	return (query: Record<string, unknown>) =>
		Object.entries(query)
			.flatMap(([name, value]) => {
				const parts = alternating(value);

				return parts.length === 0
					? []
					: `${encodePart(name)}=${parts.map(encodePart).join(delimiter)}`;
			})
			.join("&");
}

/**
 * `form` without `explode`. An array joins on a comma, and an object
 * alternates its member names and values
 */
export const formCommaSerializer = delimitedSerializer(",");

/**
 * `spaceDelimited`, stated without `explode`. The OAS example is percent
 * encoded, `id=3%204%205`
 */
export const spaceDelimitedSerializer = delimitedSerializer("%20");

/**
 * `pipeDelimited`, stated without `explode`. The OAS example leaves the pipe
 * as it is, `id=3|4|5`, and a query may hold one
 */
export const pipeDelimitedSerializer = delimitedSerializer("|");

/**
 * `deepObject`, which brackets each member under the parent name as `at[gt]=1`.
 * https://spec.openapis.org/oas/v3.2.0.html#style-values defines it for an
 * object with scalar properties and leaves anything else undefined, so a
 * non-object parameter writes as it would under `form`
 */
export function deepObjectSerializer(query: Record<string, unknown>) {
	return queryString.stringify(
		explode(query, (name, member) => `${name}[${member}]`),
		{ ...options, arrayFormat: "none" },
	);
}
