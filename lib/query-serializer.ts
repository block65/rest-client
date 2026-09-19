import queryString from "query-string";
import type { QuerySerializer } from "./types.ts";
import { toJsonValue } from "./utils.ts";

// an array holds one key's repeated values, so its items resolve individually
function resolve(value: unknown) {
	const resolved = toJsonValue(value);

	return Array.isArray(resolved) ? resolved.map(toJsonValue) : resolved;
}

/**
 * Repeats a key per array item and drops null and undefined. The client writes
 * a query this way unless the command names another serializer
 */
export const defaultQuerySerializer: QuerySerializer = (query) => {
	const params = new URLSearchParams();

	for (const [name, value] of Object.entries(query)) {
		const resolved = resolve(value);

		for (const item of Array.isArray(resolved) ? resolved : [resolved]) {
			if (item !== null && item !== undefined) {
				params.append(name, String(item));
			}
		}
	}

	return params.toString();
};

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
				Object.entries(query).map(([name, value]) => [name, resolve(value)]),
			),
			// query-string sorts its keys by default, and that reorders every
			// query the client already sends
			{ skipNull: true, sort: false, ...options },
		);
}
