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

	// a lone surrogate writes U+FFFD instead of throwing URIError out of
	// whichever encoder sees it
	return isPlainObject(resolved)
		? jsonStringify(resolved)
		: String(resolved).toWellFormed();
}

function queryParts(value: unknown) {
	const resolved = toJson(value);

	return (Array.isArray(resolved) ? resolved : [resolved])
		.map(queryValue)
		.filter((part) => part !== undefined);
}

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

// query-string alphabetises every query unless sort is off
const options = { skipNull: true, sort: false } satisfies StringifyOptions;

// what query-string's own encoder writes, for the parts it is handed raw
function encodeRFC3986URIComponent(str: string) {
	return encodeURIComponent(str.toWellFormed()).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

// url.search applies the query percent-encode set to the delimiter
function encodeDelimiter(delimiter: string) {
	const url = new URL("https://192.0.2.1/");
	url.search = delimiter;

	return url.search.slice(1);
}

// with explode, each object member becomes a parameter, named by memberName
function explode(
	query: Record<string, unknown>,
	memberName: (name: string, member: string) => string,
	// deepObject assembles unencoded, so a scalar name is encoded here
	paramName: (name: string) => string = (name) => name.toWellFormed(),
) {
	return Object.entries(query).flatMap(([name, value]) =>
		isPlainObject(value)
			? Object.entries(value).map(
					([member, memberValue]) =>
						[
							memberName(name, member.toWellFormed()),
							queryParts(memberValue),
						] as const,
				)
			: [[paramName(name), queryParts(value)] as const],
	);
}

// pairs, not an object, so two objects sharing a member keep both values
function merged(pairs: readonly (readonly [string, string[]])[]) {
	const query = new Map<string, string[]>();

	for (const [name, parts] of pairs) {
		query.set(name, [...(query.get(name) ?? []), ...parts]);
	}

	// fromEntries defines __proto__ as an own property, where assignment would
	// not
	return Object.fromEntries(query);
}

/**
 * Repeats a name per array item and omits null and undefined. An object writes
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
 * `form` with `explode`, the OAS default. An array repeats its name, and an
 * object hoists its members to parameters of their own, losing the parent name
 */
export function formSerializer(query: Record<string, unknown>) {
	return queryString.stringify(
		merged(explode(query, (_name, member) => member)),
		{ ...options, arrayFormat: "none" },
	);
}

// a delimiter the OAS writes raw stays raw, for a server that splits first
function delimitedSerializer(delimiter: string) {
	const encoded = encodeDelimiter(delimiter);

	return (query: Record<string, unknown>) =>
		Object.entries(query)
			.flatMap(([name, value]) => {
				const parts = alternating(value);

				return parts.length === 0
					? []
					: `${encodeRFC3986URIComponent(name)}=${parts.map(encodeRFC3986URIComponent).join(encoded)}`;
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
export const spaceDelimitedSerializer = delimitedSerializer(" ");

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
	// the brackets stay raw, matching the OAS example, so the name and member
	// are encoded either side of them and query-string assembles what it is
	// given
	const bracketed = explode(
		query,
		(name, member) =>
			`${encodeRFC3986URIComponent(name)}[${encodeRFC3986URIComponent(member)}]`,
		encodeRFC3986URIComponent,
	).map(
		([name, parts]) => [name, parts.map(encodeRFC3986URIComponent)] as const,
	);

	return queryString.stringify(merged(bracketed), {
		...options,
		arrayFormat: "none",
		encode: false,
	});
}
