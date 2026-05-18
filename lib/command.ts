import type { Jsonifiable, JsonValue, UndefinedOnPartialDeep } from "type-fest";
import type { HttpMethod } from "./types.ts";

type JsonifiableObject =
	| { [Key in string]?: Jsonifiable }
	| { toJSON: () => Jsonifiable };
type JsonObject = { [Key in string]?: JsonValue };

type Body = RequestInit["body"] | null | Uint8Array;

export abstract class Command<
	// WARN: this must be kept compatible with the Client Input and Output types
	CommandInput extends JsonifiableObject | unknown = unknown,
	CommandOutput extends Jsonifiable | unknown = unknown,
	CommandQuery extends UndefinedOnPartialDeep<JsonObject> = UndefinedOnPartialDeep<JsonObject>,
	CommandHeaders extends Record<string, string> = Record<string, string>,
> {
	public readonly method: HttpMethod = "get";

	public readonly pathname: string;

	public readonly body: Body | null;

	public readonly query: CommandQuery | undefined;

	// Without these, unused generics make Command<A, X> ≡ Command<B, X>
	// and the cross-client guard silently disappears.
	declare readonly __input?: CommandInput;

	declare readonly __output?: CommandOutput;

	public readonly headers: CommandHeaders | undefined;

	constructor(
		pathname: string,
		body: Body | null = null,
		query?: CommandQuery,
		headers?: CommandHeaders,
	) {
		this.pathname = pathname;
		this.body = body;
		this.query = query;
		this.headers = headers;
	}

	public serialize() {
		return JSON.stringify(this.toJSON());
	}

	// public API; standard Object.prototype.toString override
	// fallow-ignore-next-line unused-class-member
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
