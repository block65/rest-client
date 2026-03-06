/* eslint-disable max-classes-per-file */
import { CustomError } from '@block65/custom-error';
import type * as v from 'valibot';

export class ServiceError extends CustomError {

  public response: Response;

  constructor(message: string, response: Response) {
    super(message);
    this.response = response;
  }
}

export class ServiceResponseError extends CustomError {

  public response: Response;

  constructor(response: Response) {
    super(response.statusText);
    this.response = response;
  }
}

export class PublicValibotHonoError extends CustomError {
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
