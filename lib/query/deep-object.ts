import { isPlainObject } from "../utils.ts";
import { type Pair, resolveQueryValue, scalar } from "./pair.ts";

function deep(name: string, input: unknown, nestedInArray: boolean): Pair[] {
	const value = resolveQueryValue(input);

	if (value === null || value === undefined) {
		return [];
	}

	if (Array.isArray(value)) {
		const indexed =
			nestedInArray ||
			value.some((item) => isPlainObject(item) || Array.isArray(item));

		return value.flatMap((item, index) =>
			deep(indexed ? `${name}[${index}]` : name, item, true),
		);
	}

	if (isPlainObject(value)) {
		return Object.entries(value).flatMap(([member, memberValue]) =>
			deep(`${name}[${member}]`, memberValue, false),
		);
	}

	return [scalar(name, value)];
}

/**
 * `deepObject`. Each member bracketed under the parent name, as `at[gt]=1`
 */
export function writeDeepObject(name: string, value: unknown) {
	return deep(name, value, false);
}
