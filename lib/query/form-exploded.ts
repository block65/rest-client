import { isPlainObject } from "../utils.ts";
import { type Pair, resolveQueryValue, scalar } from "./pair.ts";

/**
 * `form` with `explode`, the OAS default. One key per array item or object
 * member, the member hoisted past its parent name
 */
export function writeFormExploded(name: string, input: unknown): Pair[] {
	const value = resolveQueryValue(input);

	// an invalid Date reaches here, its toJSON having returned null
	if (value === null || value === undefined) {
		return [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((item) => writeFormExploded(name, item));
	}

	if (isPlainObject(value)) {
		return Object.entries(value).flatMap(([member, memberValue]) =>
			writeFormExploded(member, memberValue),
		);
	}

	return [scalar(name, value)];
}
