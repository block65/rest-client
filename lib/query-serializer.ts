import queryString from "query-string";
import type { QuerySerializer, QueryStyles } from "./types.ts";
import { isPlainObject, toJsonValue } from "./utils.ts";

// an array holds one key's repeated values, so its items resolve individually
function resolve(value: unknown) {
	const resolved = toJsonValue(value);

	return Array.isArray(resolved)
		? resolved.map((item) => toJsonValue(item))
		: resolved;
}

// MDN's recipe, plus toWellFormed so a lone surrogate writes U+FFFD
function encodeRFC3986URIComponent(str: string) {
	return encodeURIComponent(str.toWellFormed()).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.codePointAt(0)?.toString(16).toUpperCase()}`,
	);
}

// a plain object skips toJSON, which is a legal member name in a query object
function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

type Pair = readonly [name: string, value: string];

// a Blob, a ReadableStream or a toJSON-less class instance supplies toString
function scalar(name: string, value: unknown) {
	return [name, String(value)] as const;
}

// one key per member or item, hoisting a nested object past what OAS covers
function exploded(name: string, input: unknown): Pair[] {
	const value = resolveQueryValue(input);

	// an invalid Date reaches here, its toJSON having returned null
	if (value === null || value === undefined) {
		return [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item) => exploded(name, item));
	}

	if (isPlainObject(value)) {
		return Object.entries(value).flatMap(([member, memberValue]) =>
			exploded(member, memberValue),
		);
	}

	return [scalar(name, value)];
}

// one value holds an array's items, or an object's alternating name and value
function joined(name: string, input: unknown, delimiter: string) {
	const value = resolveQueryValue(input);

	if (value === null || value === undefined) {
		return [];
	}

	// flat unwraps an array and leaves a scalar wrapped
	const parts: unknown[] = isPlainObject(value)
		? Object.entries(value).flat()
		: [value].flat();

	const usable = parts.filter((part) => part !== null && part !== undefined);

	return usable.length > 0
		? [
				scalar(
					name,
					usable.map((part) => String(resolveQueryValue(part))).join(delimiter),
				),
			]
		: [];
}

// deepObject brackets each member under the parent name, as ?at[gt]=1
function deep(name: string, input: unknown, nestedInArray: boolean): Pair[] {
	const value = resolveQueryValue(input);

	if (value === null || value === undefined) {
		return [];
	}

	if (Array.isArray(value)) {
		const indexed =
			nestedInArray ||
			value.some((item) => isPlainObject(item) || Array.isArray(item));

		return value.flatMap((item, index) =>
			deep(indexed ? `${name}[${index}]` : name, item, true),
		);
	}

	if (isPlainObject(value)) {
		return Object.entries(value).flatMap(([member, memberValue]) =>
			deep(`${name}[${member}]`, memberValue, false),
		);
	}

	return [scalar(name, value)];
}

const delimiters = { spaceDelimited: " ", pipeDelimited: "|" } as const;

// each parameter takes the style and explode of OAS 3.2 §4.12.6
function searchParamPairs(
	query: Record<string, unknown>,
	styles: QueryStyles | undefined,
) {
	return Object.entries(query).flatMap(([name, value]) => {
		const { style = "form", explode = true } = styles?.[name] ?? {};

		if (style === "deepObject") {
			return deep(name, value, false);
		}

		return explode
			? exploded(name, value)
			: joined(name, value, style === "form" ? "," : delimiters[style]);
	});
}

/**
 * Writes each parameter with the style and explode its `queryStyles` entry
 * states, or the OAS default of `form` with `explode`. Names and values take
 * the RFC 3986 encoding, so url.search returns what was written
 */
export function serializerForStyles(
	styles: QueryStyles | undefined,
): QuerySerializer {
	return (query) =>
		searchParamPairs(query, styles)
			.map(
				([name, value]) =>
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(value)}`,
			)
			.join("&");
}

/**
 * Repeats a key per array item, drops null and undefined, and hoists a nested
 * object's members. The client writes a query this way unless the command
 * names another serializer
 */
export const defaultQuerySerializer: QuerySerializer =
	serializerForStyles(undefined);

// encodeURIComponent, query-string's encoder, throws on a lone surrogate
function wellFormed(value: unknown): unknown {
	if (typeof value === "string") {
		return value.toWellFormed();
	}

	return Array.isArray(value) ? value.map((item) => wellFormed(item)) : value;
}

/**
 * Serializes with query-string. Its `arrayFormat` covers the shapes a repeated
 * key cannot, among them `comma`, `bracket` and `separator`
 */
export function createQueryStringSerializer(
	options?: queryString.StringifyOptions,
): QuerySerializer {
	return (query) =>
		queryString.stringify(
			Object.fromEntries(
				Object.entries(query).map(([name, value]) => [
					name.toWellFormed(),
					wellFormed(resolve(value)),
				]),
			),
			// query-string sorts its keys by default, and that reorders every
			// query the client already sends
			{ skipNull: true, sort: false, ...options },
		);
}
