import type { QueryEncoder, QuerySerializer } from "../types.ts";
import { encodeFormExploded } from "./form-exploded.ts";

// MDN's recipe, plus toWellFormed so a lone surrogate writes U+FFFD
function encodeRFC3986URIComponent(str: string) {
	return encodeURIComponent(str.toWellFormed()).replaceAll(
		/[!'()*]/g,
		(char) => `%${char.codePointAt(0)?.toString(16).toUpperCase()}`,
	);
}

/**
 * Writes each parameter with the encoder named for it, or the fallback.
 * Names and values take the RFC 3986 encoding, so url.search returns what
 * was written
 */
export function createQuerySerializer(
	encoders: Readonly<Record<string, QueryEncoder>>,
	fallback: QueryEncoder = encodeFormExploded,
): QuerySerializer {
	return function serializeQuery(query) {
		return Object.entries(query)
			.flatMap(([name, value]) => {
				// a parameter named constructor must not pick up Object.prototype's
				const encode = Object.hasOwn(encoders, name)
					? (encoders[name] ?? fallback)
					: fallback;

				return encode(name, value);
			})
			.map(
				([name, value]) =>
					`${encodeRFC3986URIComponent(name)}=${encodeRFC3986URIComponent(value)}`,
			)
			.join("&");
	};
}

/**
 * Repeats a key per array item, drops null and undefined, and hoists a nested
 * object's members. The client writes a query this way unless the command
 * names another serializer
 */
export const defaultQuerySerializer: QuerySerializer = createQuerySerializer(
	{},
);
