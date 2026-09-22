import { isPlainObject } from "../utils.ts";
import { type Pair, resolveQueryValue, scalar } from "./encoder.ts";

/**
 * One value holds an array's items, or an object's alternating member name
 * and value
 */
export function joined(
	name: string,
	input: unknown,
	delimiter: string,
): Pair[] {
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
