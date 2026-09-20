import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import type { HttpMethod, QuerySerializer, QueryStyles } from "./types.ts";

type JsonObject = { [Key in string]?: JsonValue };

type Body = RequestInit["body"] | null | Uint8Array;

export abstract class Command<
	// must stay compatible with the Client Input and Output types
	CommandInput = unknown,
	CommandOutput = unknown,
	CommandQuery extends UndefinedOnPartialDeep<JsonObject> =
		UndefinedOnPartialDeep<JsonObject>,
	CommandHeaders extends Record<string, string> = Record<string, string>,
> {
	public readonly method: HttpMethod = "get";

	public readonly pathname: string;

	public readonly body: Body | null;

	// Callers build the query from an UndefinedOnPartialDeep input, so any
	// optional member — including one nested inside a deepObject parameter —
	// can arrive explicitly undefined. stripUndefined only clears the top
	// level, so the deep-widened type is what is actually held
	public readonly query: UndefinedOnPartialDeep<CommandQuery> | undefined;

	// Lists the parameters where the document states something other than the
	// OAS default. An unlisted parameter uses that default
	public readonly queryStyles: QueryStyles | undefined;

	// Replaces the styles above for the whole query, for a server the OAS
	// styles cannot describe
	public readonly querySerializer: QuerySerializer | undefined;

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
		this.query = query;
		this.headers = headers;
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
