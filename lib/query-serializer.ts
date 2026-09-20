import queryString from "query-string";
import type { QuerySerializer } from "./types.ts";
import { toJsonValue } from "./utils.ts";

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

/**
 * Repeats a key per array item and drops null and undefined. The client writes
 * a query this way unless the command names another serializer
 */
export const defaultQuerySerializer: QuerySerializer = (query) => {
	const pairs: string[] = [];

	for (const [name, value] of Object.entries(query)) {
		const resolved = resolve(value);

		for (const item of Array.isArray(resolved) ? resolved : [resolved]) {
			if (item !== null && item !== undefined) {
				// URLSearchParams would write a space as +, which is a space only
				// under the form-urlencoded rules
				pairs.push(
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(String(item))}`,
				);
			}
		}
	}

	return pairs.join("&");
};

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
