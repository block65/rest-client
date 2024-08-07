import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { HttpMethod } from './types.js';

function maybeWithNullProto<T>(val: T): T {
  return typeof val === 'object'
    ? Object.assign(Object.create(null), val)
    : val;
}

type Middleware<
  CommandInput extends JsonifiableObject | unknown = unknown,
  CommandOutput extends Jsonifiable | unknown = unknown,
> = (input: CommandInput, output: CommandOutput) => CommandOutput;

export abstract class Command<
  // WARN: this must be kept compatible with the Client Input and Output types
  CommandInput extends JsonifiableObject | unknown = unknown,
  CommandOutput extends Jsonifiable | unknown = unknown,
  CommandBody extends Jsonifiable | unknown = unknown,
  CommandQuery extends JsonifiableObject | unknown = unknown,
> {
  public readonly method: HttpMethod = 'get';

  readonly #pathname: string;

  readonly #body: CommandBody | undefined;

  readonly #query: CommandQuery | undefined;

  protected middleware: Middleware<CommandInput, CommandOutput>[] = [];

  constructor(pathname: string, body?: CommandBody, query?: CommandQuery) {
    this.#pathname = pathname;
    this.#body = maybeWithNullProto(body);
    this.#query = maybeWithNullProto(query);
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

  public get body() {
    return this.#body;
  }

  public get query() {
    return this.#query;
  }

  public get pathname() {
    return this.#pathname;
  }
}
