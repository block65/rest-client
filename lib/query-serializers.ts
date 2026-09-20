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

// with explode, each object member becomes a parameter, named by encodedName
function explode(
	query: Record<string, unknown>,
	encodedName: (name: string, member: string) => string,
) {
	return Object.entries(query).flatMap(([name, value]) =>
		isPlainObject(value)
			? Object.entries(value).map(
					([member, memberValue]) =>
						[encodedName(name, member), queryParts(memberValue)] as const,
				)
			: [[encodeRFC3986URIComponent(name), queryParts(value)] as const],
	);
}

// a repeated name is legal, so two objects sharing a member keep both values
function explodedSerializer(
	encodedName: (name: string, member: string) => string,
) {
	return (query: Record<string, unknown>) =>
		explode(query, encodedName)
			.flatMap(([name, parts]) =>
				parts.map((part) => `${name}=${encodeRFC3986URIComponent(part)}`),
			)
			.join("&");
}

/**
 * Repeats a name per array item and omits null and undefined. An object writes
 * as JSON. The client writes a query this way unless the command names another
 * serializer
 */
export function searchParamsSerializer(query: Record<string, unknown>) {
	return Object.entries(query)
		.flatMap(([name, value]) =>
			queryParts(value).map(
				(part) =>
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(part)}`,
			),
		)
		.join("&");
}

/**
 * Each style follows OpenAPI 3.2,
 * https://spec.openapis.org/oas/v3.2.0.html#style-examples
 *
 * `form` with `explode`, the OAS default. An array repeats its name, and an
 * object hoists its members to parameters of their own, losing the parent name
 */
export const formSerializer = explodedSerializer((_name, member) =>
	encodeRFC3986URIComponent(member),
);

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
export const deepObjectSerializer = explodedSerializer(
	(name, member) =>
		`${encodeRFC3986URIComponent(name)}[${encodeRFC3986URIComponent(member)}]`,
);
