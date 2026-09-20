import type { QueryStyles } from "./types.ts";
import { isPlainObject, toJsonValue } from "./utils.ts";

// a plain object skips toJSON, which is a legal member name in a query object
function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

/**
 * Writes each parameter with the style and explode OAS 3.2 §4.12.6 gives it,
 * taken from the command's queryStyles. An unlisted parameter takes the OAS
 * default of `form` with `explode`
 */
export function appendSearchParams(
	target: URLSearchParams,
	query: Record<string, unknown> | undefined,
	styles: QueryStyles | undefined,
) {
	// a Blob, a ReadableStream or a toJSON-less class instance supplies toString
	const appendScalar = (name: string, value: unknown) => {
		target.append(name, String(value));
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

	for (const [name, value] of Object.entries(query ?? {})) {
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
