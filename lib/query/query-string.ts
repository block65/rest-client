import queryString from "query-string";
import type { QuerySerializer } from "../types.ts";
import { maybeToJson } from "../utils.ts";

// an array holds one key's repeated values, so its items resolve individually
function resolve(value: unknown) {
	const resolved = maybeToJson(value);

	return Array.isArray(resolved)
		? resolved.map((item) => maybeToJson(item))
		: resolved;
}

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
	return function queryStringSerializer(query) {
		return queryString.stringify(
			Object.fromEntries(
				Object.entries(query).map(([name, value]) => [
					name.toWellFormed(),
					wellFormed(resolve(value)),
				]),
			),
			// keys keep their written order, as the default serializer's do, so
			// the same query serializes to the same URL under either serializer
			{ skipNull: true, sort: false, ...options },
		);
	};
}
