import {
	CustomError,
	isStatusCode,
	type StatusCode,
} from "@block65/custom-error";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Command } from "./command.ts";
import { isPlainObject } from "./utils.ts";

export class ServiceError extends CustomError {
	override code: StatusCode = CustomError.UNAVAILABLE;

	public response: Response;

	constructor(message: string, code: StatusCode, res: Response) {
		super(message);
		this.code = code;
		this.response = res;
	}

	/**
	 * Reconstructs a ServiceError from a raw response body and the originating
	 * Response. A structured body supplies message, code and details. Any
	 * other body falls back to `res.statusText` with an `http-<status>` detail
	 */
	public static fromResponse(res: Response, body: unknown) {
		if (isPlainObject(body) && "message" in body) {
			const err = new ServiceError(
				typeof body.message === "string" ? body.message : res.statusText,
				isStatusCode(body.code) ? body.code : CustomError.UNKNOWN,
				res,
			);

			if ("details" in body && Array.isArray(body.details)) {
				err.addDetail(...body.details);
			}

			return err;
		}
		return new ServiceError(res.statusText, CustomError.UNKNOWN, res).addDetail(
			{
				reason: `http-${res.status}`,
				metadata: {
					status: res.status.toString(),
					statusText: res.statusText,
				},
			},
		);
	}
}

/**
 * Wraps a response-validation failure with the command and URL behind it,
 * which the schema's issues do not name
 */
export class ResponseValidationError extends CustomError {
	override code = CustomError.INVALID_ARGUMENT;

	public command: Command;

	// events() validates items after stream() has resolved, where the URL is gone
	public url: URL | undefined;

	constructor(command: Command, url: URL | undefined, cause: unknown) {
		super(
			`Response validation failed: ${command.method.toUpperCase()} ${url?.toString() ?? command.pathname}`,
			cause,
		);
		this.command = command;
		this.url = url;
	}
}

/**
 * A validation failure safe to surface to callers, built from
 * Standard Schema issues so it works with any spec-compliant validator
 */
export class PublicValidationError extends CustomError {
	override code = CustomError.INVALID_ARGUMENT;

	static fromIssues(issues: readonly StandardSchemaV1.Issue[]) {
		const message = issues[0]?.message ?? "Validation failed";
		return new PublicValidationError(message).addDetail({
			violations: issues.map((issue) => ({
				field:
					issue.path
						?.map((segment) =>
							typeof segment === "object"
								? String(segment.key)
								: String(segment),
						)
						.join(".") || "",
				description: issue.message,
			})),
			description: message,
		});
	}
}
