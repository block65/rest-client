import type { QueryParameterStyle, QuerySerializer } from "../types.ts";
import { isPlainObject, isStringifiable, toJsonValue } from "../utils.ts";

type UnencodedPair = readonly [name: string, value: string];

type SerializeParameter = (name: string, value: unknown) => UnencodedPair[];

// a plain object skips toJSON, a legal member name in a query object
function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

// a plain object never reaches here, each style walks it first
function stringifyScalar(name: string, value: unknown) {
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
			throw new TypeError(
				`query parameter ${name} holds a ${typeof value} with no string form`,
			);
	}
}

// form with explode, the OAS default. A member hoists past its parent name
function explode(name: string, value: unknown): UnencodedPair[] {
	const resolvedValue = resolveQueryValue(value);

	// an invalid Date reaches here, its toJSON having returned null
	if (resolvedValue === null || resolvedValue === undefined) {
		return [];
	}

	const pairs: UnencodedPair[] = [];

	if (Array.isArray(resolvedValue)) {
		for (const item of resolvedValue) {
			pairs.push(...explode(name, item));
		}
	} else if (isPlainObject(resolvedValue)) {
		for (const [member, memberValue] of Object.entries(resolvedValue)) {
			pairs.push(...explode(member, memberValue));
		}
	} else {
		pairs.push([name, stringifyScalar(name, resolvedValue)]);
	}

	return pairs;
}

// an object's members alternate name and value, as OAS shows for explode false
function joinableParts(value: unknown) {
	if (Array.isArray(value)) {
		return value;
	}

	if (isPlainObject(value)) {
		const parts: unknown[] = [];

		for (const [member, memberValue] of Object.entries(value)) {
			parts.push(member, memberValue);
		}

		return parts;
	}

	return [value];
}

// without explode, one value holds every item joined with the delimiter
function join(name: string, input: unknown, delimiter: string) {
	const value = resolveQueryValue(input);

	if (value === null || value === undefined) {
		return [];
	}

	const usable: string[] = [];

	for (const part of joinableParts(value)) {
		if (part !== null && part !== undefined) {
			usable.push(stringifyScalar(name, resolveQueryValue(part)));
		}
	}

	if (usable.length === 0) {
		return [];
	}

	const pair: UnencodedPair = [name, usable.join(delimiter)];

	return [pair];
}

// deepObject brackets each member under the parent name, as at[gt]=1
function bracket(
	name: string,
	input: unknown,
	nestedInArray = false,
): UnencodedPair[] {
	const value = resolveQueryValue(input);

	if (value === null || value === undefined) {
		return [];
	}

	const pairs: UnencodedPair[] = [];

	if (Array.isArray(value)) {
		const indexed =
			nestedInArray ||
			value.some((item) => isPlainObject(item) || Array.isArray(item));

		for (const [index, item] of value.entries()) {
			pairs.push(...bracket(indexed ? `${name}[${index}]` : name, item, true));
		}
	} else if (isPlainObject(value)) {
		for (const [member, memberValue] of Object.entries(value)) {
			pairs.push(...bracket(`${name}[${member}]`, memberValue, false));
		}
	} else {
		pairs.push([name, stringifyScalar(name, value)]);
	}

	return pairs;
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
		const encoded: string[] = [];

		for (const [name, value] of Object.entries(query)) {
			const serialize = styles.get(name) ?? explode;

			for (const [pairName, pairValue] of serialize(name, value)) {
				encoded.push(
					`${encodeRFC3986URIComponent(pairName)}=${encodeRFC3986URIComponent(pairValue)}`,
				);
			}
		}

		return encoded.join("&");
	};
}

/**
 * Every parameter as form with explode. A key repeats per array item, null
 * and undefined are dropped, a nested object's members are hoisted. The
 * client uses this unless the command supplies a serializer
 */
export const defaultQuerySerializer = createQuerySerializer();
