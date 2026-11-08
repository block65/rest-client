import {
	CustomError,
	isStatusCode,
	type StatusCode,
} from "@block65/custom-error";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Command } from "./commands/command.ts";
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
	 * Builds a ServiceError from a response and its body. A plain-object body
	 * with a status `code` is an error body. Its `details` are kept, and its
	 * message is the first localised detail's, since a server never sends the
	 * thrown message. Any other body falls back to `res.statusText` with an
	 * `http-<status>` detail
	 */
	public static fromResponse(res: Response, body: unknown) {
		if (isPlainObject(body) && isStatusCode(body.code)) {
			const details =
				"details" in body && Array.isArray(body.details) ? body.details : [];
			const localised = details.find(
				(detail): detail is { message: string } =>
					isPlainObject(detail) &&
					"locale" in detail &&
					typeof detail.message === "string",
			);
			const err = new ServiceError(
				localised?.message ?? res.statusText,
				body.code,
				res,
			);

			if (details.length > 0) {
				err.addDetail(...details);
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
 * Wraps a response body's validation failure, or a sequential item's decode
 * failure, with the command and URL behind it, which the cause does not name
 */
export class ResponseValidationError extends CustomError {
	override code = CustomError.INVALID_ARGUMENT;

	public command: Command;

	public url: URL;

	constructor(command: Command, url: URL, cause: unknown) {
		super(
			`Response validation failed: ${command.method.toUpperCase()} ${url.toString()}`,
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
