import type { QueryParameterStyle, QuerySerializer } from "../types.ts";
import { isPlainObject, stringifyScalar, maybeToJson } from "../utils.ts";

type NameValuePair = readonly [name: string, value: string];

type SerializeParameter = (name: string, value: unknown) => NameValuePair[];

// a plain object never reaches here, each style walks it first
function stringifyParameter(name: string, value: unknown) {
	const text = stringifyScalar(value);

	if (text === undefined) {
		throw new TypeError(
			`query parameter ${name} holds a ${typeof value} with no string form`,
		);
	}

	return text;
}

// form with `explode`, the OAS default. Each item or member becomes one pair
function explode(name: string, value: unknown): NameValuePair[] {
	const jsonValue = maybeToJson(value);

	// a query string is text, so `null` and `undefined` mean the parameter is
	// absent, as `JSON.stringify` treats undefined. An invalid `Date` lands here
	// too, its `toJSON` having returned null
	if (jsonValue === null || jsonValue === undefined) {
		return [];
	}

	if (Array.isArray(jsonValue)) {
		return jsonValue.flatMap((item) => explode(name, item));
	}

	if (isPlainObject(jsonValue)) {
		return Object.entries(jsonValue).flatMap(([member, memberValue]) =>
			explode(member, memberValue),
		);
	}

	return [[name, stringifyParameter(name, jsonValue)]];
}

// an object's members alternate name and value, as OAS shows for explode false
function maybeFlatten(value: unknown) {
	if (Array.isArray(value)) {
		return value;
	}

	if (isPlainObject(value)) {
		return Object.entries(value).flat();
	}

	return [value];
}

// without explode, one value holds every item joined with the delimiter
function join(name: string, value: unknown, delimiter: string) {
	const jsonValue = maybeToJson(value);

	// absent, for the reason explode gives
	if (jsonValue === null || jsonValue === undefined) {
		return [];
	}

	const usable = maybeFlatten(jsonValue)
		.filter((item) => item !== null && item !== undefined)
		.map((item) => stringifyParameter(name, maybeToJson(item)));

	// an empty join would write tags=, and a server reads that as one empty
	// string
	if (usable.length === 0) {
		return [];
	}

	const pair: NameValuePair = [name, usable.join(delimiter)];

	return [pair];
}

// deepObject brackets each member under the parent name, as at[gt]=1
function bracket(
	name: string,
	value: unknown,
	nestedInArray = false,
): NameValuePair[] {
	const jsonValue = maybeToJson(value);

	// absent, for the reason explode gives
	if (jsonValue === null || jsonValue === undefined) {
		return [];
	}

	if (Array.isArray(jsonValue)) {
		const indexed =
			nestedInArray ||
			jsonValue.some((item) => isPlainObject(item) || Array.isArray(item));

		return jsonValue.flatMap((item, index) =>
			bracket(indexed ? `${name}[${index}]` : name, item, true),
		);
	}

	if (isPlainObject(jsonValue)) {
		return Object.entries(jsonValue).flatMap(([member, memberValue]) =>
			bracket(`${name}[${member}]`, memberValue, false),
		);
	}

	return [[name, stringifyParameter(name, jsonValue)]];
}

const delimiters = {
	form: ",",
	spaceDelimited: " ",
	pipeDelimited: "|",
} as const;

// explode defaults to true for form and false otherwise, as OAS states
function selectStyle({
	style = "form",
	explode: exploded = style === "form",
}: QueryParameterStyle) {
	if (style === "deepObject") {
		return bracket;
	}

	// OAS 3.2 gives an exploded spaceDelimited or pipeDelimited array the
	// same form as an exploded form array
	if (exploded) {
		return explode;
	}

	const delimiter = delimiters[style];

	return function joinDelimited(name: string, value: unknown) {
		return join(name, value, delimiter);
	};
}

// MDN's recipe, plus toWellFormed so a lone surrogate writes U+FFFD
function encodeRFC3986URIComponent(str: string) {
	return encodeURIComponent(str.toWellFormed()).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.codePointAt(0)?.toString(16).toUpperCase()}`,
	);
}

/**
 * Serializes each parameter in the style named for it, the rest as form with
 * explode. Every name and value is RFC 3986 encoded once, so url.search
 * returns the serialized string unchanged
 */
export function createQuerySerializer(
	parameters: Readonly<Record<string, QueryParameterStyle>> = {},
): QuerySerializer {
	// each style resolves once, so a request does one lookup per parameter
	const styles = new Map<string, SerializeParameter>();

	for (const [name, parameter] of Object.entries(parameters)) {
		styles.set(name, selectStyle(parameter));
	}

	return function serializeQuery(query) {
		return Object.entries(query)
			.flatMap(([name, value]) => (styles.get(name) ?? explode)(name, value))
			.map(
				([name, value]) =>
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(value)}`,
			)
			.join("&");
	};
}

/**
 * Every parameter as form with explode. A key repeats per array item, null
 * and undefined are dropped, an object's members write under the member
 * names with the parent name dropped. The
 * client uses this unless the command supplies a serializer
 */
export const defaultQuerySerializer = createQuerySerializer();
