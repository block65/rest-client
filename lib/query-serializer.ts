import queryString from "query-string";
import type { QuerySerializer, QueryStyles } from "./types.ts";
import { isPlainObject, toJsonValue } from "./utils.ts";

// an array holds one key's repeated values, so its items resolve individually
function resolve(value: unknown) {
	const resolved = toJsonValue(value);

	return Array.isArray(resolved) ? resolved.map(toJsonValue) : resolved;
}

// MDN's recipe, plus toWellFormed so a lone surrogate writes U+FFFD
function encodeRFC3986URIComponent(str: string) {
	return encodeURIComponent(str.toWellFormed()).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

// a plain object skips toJSON, which is a legal member name in a query object
function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

// each parameter takes the style and explode of OAS 3.2 §4.12.6
function writeSearchParams(
	write: (name: string, value: string) => void,
	query: Record<string, unknown>,
	styles: QueryStyles | undefined,
) {
	// a Blob, a ReadableStream or a toJSON-less class instance supplies toString
	const appendScalar = (name: string, value: unknown) => {
		write(name, String(value));
	};

	// one key per member or item, hoisting a nested object past what OAS covers
	const appendExploded = (name: string, input: unknown) => {
		const value = resolveQueryValue(input);

		// an invalid Date reaches here, its toJSON having returned null
		if (value === null || value === undefined) {
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				appendExploded(name, item);
			}

			return;
		}

		if (isPlainObject(value)) {
			for (const [member, memberValue] of Object.entries(value)) {
				appendExploded(member, memberValue);
			}

			return;
		}

		appendScalar(name, value);
	};

	// one value holds an array's items, or an object's alternating name and value
	const appendJoined = (name: string, input: unknown, delimiter: string) => {
		const value = resolveQueryValue(input);

		if (value === null || value === undefined) {
			return;
		}

		let parts: unknown[] = [value];

		if (Array.isArray(value)) {
			parts = value;
		} else if (isPlainObject(value)) {
			parts = Object.entries(value).flat();
		}

		const usable = parts.filter((part) => part !== null && part !== undefined);

		if (usable.length > 0) {
			appendScalar(
				name,
				usable.map((part) => String(resolveQueryValue(part))).join(delimiter),
			);
		}
	};

	// deepObject brackets each member under the parent name, as ?at[gt]=1
	const appendDeep = (name: string, input: unknown, nestedInArray: boolean) => {
		const value = resolveQueryValue(input);

		if (value === null || value === undefined) {
			return;
		}

		if (Array.isArray(value)) {
			const indexed =
				nestedInArray ||
				value.some((item) => isPlainObject(item) || Array.isArray(item));

			value.forEach((item, index) => {
				appendDeep(indexed ? `${name}[${index}]` : name, item, true);
			});

			return;
		}

		if (isPlainObject(value)) {
			for (const [member, memberValue] of Object.entries(value)) {
				appendDeep(`${name}[${member}]`, memberValue, false);
			}

			return;
		}

		appendScalar(name, value);
	};

	const delimiters = { spaceDelimited: " ", pipeDelimited: "|" } as const;

	for (const [name, value] of Object.entries(query)) {
		const { style = "form", explode = true } = styles?.[name] ?? {};

		if (style === "deepObject") {
			appendDeep(name, value, false);
		} else if (explode) {
			appendExploded(name, value);
		} else {
			appendJoined(name, value, style === "form" ? "," : delimiters[style]);
		}
	}
}

/**
 * Writes a query the way the OpenAPI document states, taking each parameter's
 * style and explode from the command's `queryStyles`. An unlisted parameter
 * takes the OAS default of `form` with `explode`. Both names and values go
 * through the RFC 3986 encoding, so url.search returns what was written
 */
export function createStyledSerializer(
	styles: QueryStyles | undefined,
): QuerySerializer {
	return (query) => {
		const pairs: string[] = [];

		writeSearchParams(
			(name, value) => {
				pairs.push(
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(value)}`,
				);
			},
			query,
			styles,
		);

		return pairs.join("&");
	};
}

/**
 * Repeats a key per array item, drops null and undefined, and hoists a nested
 * object's members. The client writes a query this way unless the command
 * names another serializer
 */
export const defaultQuerySerializer: QuerySerializer =
	createStyledSerializer(undefined);

// encodeURIComponent, query-string's encoder, throws on a lone surrogate
function wellFormed(value: unknown): unknown {
	if (typeof value === "string") {
		return value.toWellFormed();
	}

	return Array.isArray(value) ? value.map(wellFormed) : value;
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
