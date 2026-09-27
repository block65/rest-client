import type { StandardSchemaV1 } from "@standard-schema/spec";
import { PublicValidationError } from "./errors.ts";

/**
 * Validates a value, or a Promise of one, with any Standard Schema. Sync when
 * the value and schema are, a Promise when either isn't. Issues throw, or
 * reject, a PublicValidationError
 */
export function validate<T>(
	schema: StandardSchemaV1<unknown, T>,
	value: unknown,
): T | Promise<T> {
	if (value instanceof Promise) {
		return value.then((settled: unknown) => validate(schema, settled));
	}

	const result = schema["~standard"].validate(value);

	if (result instanceof Promise) {
		return result.then((checked) => {
			if (checked.issues) {
				throw PublicValidationError.fromIssues(checked.issues);
			}

			return checked.value;
		});
	}

	if (result.issues) {
		throw PublicValidationError.fromIssues(result.issues);
	}

	return result.value;
}
