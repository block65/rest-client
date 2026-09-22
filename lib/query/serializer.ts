import queryString from "query-string";
import type { UnknownRecord } from "type-fest";
import { isPlainObject, maybeToJson, stringifyScalar } from "../utils.ts";

// what query-string encodes, one value or the items of an array
type Prepared = Record<string, string | string[]>;

type Prepare = (name: string, value: unknown) => Prepared;

// query-string sorts keys unless told not to, and the client owns the order
const options = { sort: false, strict: true, encode: true } as const;

const utf8 = new TextEncoder();

// a scalar as query-string will encode it
function text(name: string, value: unknown) {
	// the spec's undefined value, written as an empty value
	if (value === null) {
		return "";
	}

	// each style writes one level, and the spec leaves anything deeper
	// undefined
	if (Array.isArray(value) || isPlainObject(value)) {
		throw new TypeError(
			`query parameter ${name} nests an array or object where the OpenAPI style allows a scalar`,
		);
	}

	const scalar = stringifyScalar(value);

	if (scalar === undefined) {
		throw new TypeError(
			`query parameter ${name} holds a value with no string form`,
		);
	}

	// encodeURIComponent throws on a lone surrogate, this writes U+FFFD
	return scalar.toWellFormed();
}

function texts(name: string, items: unknown[]) {
	return items.map((item) => text(name, maybeToJson(item)));
}

// an object's members alternate name and value, as OAS shows for explode false
function flatten(name: string, members: UnknownRecord) {
	return Object.entries(members).flatMap(([member, value]) => [
		member,
		text(name, maybeToJson(value)),
	]);
}

// each member becomes a parameter, named as the style renames it
function spread(members: UnknownRecord, rename: (member: string) => string) {
	return Object.fromEntries(
		Object.entries(members).map(([member, value]) => [
			rename(member),
			text(member, maybeToJson(value)),
		]),
	);
}

// form with explode, where an array repeats the name and an object drops it
function explode(name: string, value: unknown) {
	if (Array.isArray(value)) {
		return { [name]: texts(name, value) };
	}

	if (isPlainObject(value)) {
		return spread(value, (member) => member);
	}

	return { [name]: text(name, value) };
}

// without explode one value holds every item, and query-string joins them
function join(name: string, value: unknown) {
	if (Array.isArray(value)) {
		return { [name]: texts(name, value) };
	}

	if (isPlainObject(value)) {
		return { [name]: flatten(name, value) };
	}

	return { [name]: text(name, value) };
}

// deepObject brackets each member under the parent name, as at[gt]=1
function bracket(name: string, value: unknown) {
	if (isPlainObject(value)) {
		return spread(value, (member) => `${name}[${member}]`);
	}

	// the spec defines deepObject for an object alone, and a command's other
	// parameters still need writing, so those take the default style
	return explode(name, value);
}

// a value with toJSON is written as JSON.stringify would show it
function prepare(query: UnknownRecord, style: Prepare) {
	const pairs: [written: string, value: string | string[]][] = [];

	for (const [name, value] of Object.entries(query)) {
		const jsonValue = maybeToJson(value);

		// absent, as JSON.stringify leaves an undefined member
		if (jsonValue === undefined) {
			continue;
		}

		for (const pair of Object.entries(style(name, jsonValue))) {
			// an exploded object drops its name, so a member can take the name
			// of another parameter, and one of them would be lost
			if (pairs.some(([written]) => written === pair[0])) {
				throw new TypeError(
					`query parameter ${name} writes ${pair[0]}, which is already written`,
				);
			}

			pairs.push(pair);
		}
	}

	return Object.fromEntries(pairs);
}

// query-string writes the separator raw, and the spec shows it encoded
function encodeSeparator(serialized: string, separator: string) {
	// a byte is two hex digits, where toString(16) alone would drop a leading
	// zero. toHex would do this, but Node 24 does not have it
	const encoded = Array.from(
		utf8.encode(separator),
		(byte) => `%${byte.toString(16).padStart(2, "0").toUpperCase()}`,
	).join("");

	// strict encoding has already encoded every space and pipe in a name or
	// value, so each one still raw is a separator
	return serialized.replaceAll(separator, encoded);
}

export function formExplodeSerializer(query: UnknownRecord) {
	return queryString.stringify(prepare(query, explode), {
		...options,
		arrayFormat: "none",
	});
}

export function formJoinSerializer(query: UnknownRecord) {
	return queryString.stringify(prepare(query, join), {
		...options,
		arrayFormat: "comma",
	});
}

export function spaceDelimitedSerializer(query: UnknownRecord) {
	return encodeSeparator(
		queryString.stringify(prepare(query, join), {
			...options,
			arrayFormat: "separator",
			arrayFormatSeparator: " ",
		}),
		" ",
	);
}

export function pipeDelimitedSerializer(query: UnknownRecord) {
	return encodeSeparator(
		queryString.stringify(prepare(query, join), {
			...options,
			arrayFormat: "separator",
			arrayFormatSeparator: "|",
		}),
		"|",
	);
}

export function deepObjectSerializer(query: UnknownRecord) {
	return queryString.stringify(prepare(query, bracket), {
		...options,
		arrayFormat: "none",
	});
}
