import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { formExplodeSerializer } from "../query/serializer.ts";
import type {
	HttpMethod,
	QuerySerializer,
	ResolvableHeaders,
} from "../types.ts";
import { validate } from "../validate.ts";

type JsonObject = { [Key in string]?: JsonValue };

type Body = RequestInit["body"] | null | Uint8Array;

export type CommandQueryObject = UndefinedOnPartialDeep<JsonObject>;

export type CommandHeadersObject = ResolvableHeaders;

export abstract class Command<
	// must stay compatible with the Client Input and Output types
	CommandInput = unknown,
	CommandOutput = unknown,
	CommandQuery extends UndefinedOnPartialDeep<JsonObject> =
		UndefinedOnPartialDeep<JsonObject>,
	CommandHeaders extends CommandHeadersObject = CommandHeadersObject,
> {
	public readonly method: HttpMethod = "get";

	public readonly pathname: string;

	public readonly body: Body | null;

	// an optional member at any depth, a deepObject parameter's included, may
	// hold an explicit undefined
	public readonly query: UndefinedOnPartialDeep<CommandQuery> | undefined;

	// form with explode, the OpenAPI default for a query parameter
	public readonly querySerializer: QuerySerializer = formExplodeSerializer;

	// its output may hold an optional member as explicitly undefined
	public readonly responseSchema?: StandardSchemaV1<
		unknown,
		UndefinedOnPartialDeep<NoInfer<CommandOutput>>
	>;

	// Without these, unused generics make Command<A, X> ≡ Command<B, X>
	// and the cross-client guard silently disappears
	declare readonly "~input"?: CommandInput;
	declare readonly "~output"?: CommandOutput;

	public readonly headers: CommandHeaders | undefined;

	constructor(
		pathname: string,
		body?: Body | null,
		query?: UndefinedOnPartialDeep<CommandQuery>,
		headers?: CommandHeaders,
	) {
		this.pathname = pathname;
		this.body = body;
		this.query = structuredClone(query);

		// a shallow copy, as a resolver function can't be cloned
		this.headers = headers && { ...headers };
	}

	/**
	 * Turns the decoded body into the command's output, checked against
	 * `responseSchema` when there is one. May return a Promise
	 */
	public parseBody(body: unknown) {
		const checked = this.responseSchema
			? validate(this.responseSchema, body)
			: body;

		const output: CommandOutput | Promise<CommandOutput> =
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bridges UndefinedOnPartialDeep<CommandOutput> to CommandOutput, which the server's contract promises
			checked as CommandOutput | Promise<CommandOutput>;

		return output;
	}

	public serialize() {
		return JSON.stringify(this.toJSON());
	}

	// public API, overriding Object.prototype.toString
	public toString() {
		return this.serialize();
	}

	public toJSON() {
		return {
			method: this.method,
			pathname: this.pathname,
			body: this.body,
			query: this.query,
		};
	}
}
