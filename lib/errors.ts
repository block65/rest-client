/* eslint-disable max-classes-per-file */
import {
	CustomError,
	isStatusCode,
	type StatusCode,
} from "@block65/custom-error";
import type * as v from "valibot";
import { Command } from "./command.ts";
import { isPlainObject } from "./utils.ts";

export class ServiceError extends CustomError {
	override code: StatusCode = CustomError.UNAVAILABLE;

	public response: Response;

	constructor(message: string, code: StatusCode, response: Response) {
		super(message);
		this.code = code;
		this.response = response;
	}

	/**
	 * Reconstructs a ServiceError from a raw response body and the originating
	 * Response. Structured error bodies ({code?, message, details?}) are
	 * unpacked into the error's message, code, and details; otherwise falls
	 * back to `response.statusText` with an `http-<status>` detail.
	 */
	public static fromResponse(response: Response, body: unknown) {
		if (isPlainObject(body) && "message" in body) {
			const err = new ServiceError(
				typeof body.message === "string" ? body.message : response.statusText,
				isStatusCode(body.code) ? body.code : CustomError.UNKNOWN,
				response,
			);

			if ("details" in body && Array.isArray(body.details)) {
				err.addDetail(...body.details);
			}

			return err;
		} else {
			return new ServiceError(
				response.statusText,
				CustomError.UNKNOWN,
				response,
			).addDetail({
				reason: `http-${response.status}`,
				metadata: {
					status: response.status.toString(),
					statusText: response.statusText,
				},
			});
		}
	}
}

/**
 * Wraps a response-validation failure with the command/URL context — the bare
 * ValiError on its own doesn't tell you which request produced the bad body.
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

export class PublicValibotHonoError extends CustomError {
	override code = CustomError.INVALID_ARGUMENT;

	static from(
		err: v.ValiError<
			| v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>
			| v.BaseSchemaAsync<unknown, unknown, v.BaseIssue<unknown>>
		>,
	) {
		return new PublicValibotHonoError(err.message, err).addDetail({
			violations: err.issues.map((issue) => ({
				field: issue.path?.[0]?.key?.toString() || "",
				description: issue.message,
			})),
			description: err.message,
		});
	}
}
