import type { Jsonifiable } from "type-fest";
import type { HttpMethod } from "./types.ts";

type JsonifiableObject = {[Key in string]?: Jsonifiable} | {toJSON: () => Jsonifiable};

function maybeWithNullProto<T>(val: T): T {
	return typeof val === "object" && val !== null
		? Object.assign(Object.create(null), val)
		: val;
}

type Middleware<
	CommandInput extends JsonifiableObject | unknown = unknown,
	CommandOutput extends Jsonifiable | unknown = unknown,
> = (input: CommandInput, output: CommandOutput) => CommandOutput;

type Body = RequestInit['body'] | null | Uint8Array

export abstract class Command<
	// WARN: this must be kept compatible with the Client Input and Output types
	CommandInput extends JsonifiableObject | unknown = unknown,
	CommandOutput extends Jsonifiable | unknown = unknown,
	CommandQuery extends JsonifiableObject | unknown = unknown,
	CommandHeaders extends Record<string, string | number | boolean> = Record<string, string>,
> {
	public readonly method: HttpMethod = "get";

	public readonly pathname: string;

	public readonly body: Body | null;

	public readonly query: CommandQuery | undefined;

	public readonly headers: CommandHeaders | undefined;

	protected middleware: Middleware<CommandInput, CommandOutput>[] = [];

	constructor(pathname: string, body: Body | null = null, query?: CommandQuery, headers?: CommandHeaders) {
		this.pathname = pathname;
		this.body = body;
		this.query = maybeWithNullProto(query);
		this.headers = headers;
	}

	public serialize() {
		return JSON.stringify(this.toJSON());
	}

	public toString() {
		return this.serialize();
	}

	public toJSON() {
		return maybeWithNullProto({
			method: this.method,
			pathname: this.pathname,
			body: this.body,
			query: this.query,
		});
	}

}
