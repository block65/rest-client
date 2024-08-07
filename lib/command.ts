import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { HttpMethod } from './types.js';

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
  public method: HttpMethod = 'get';

  #pathname: string;

  #body: CommandBody | undefined;

  #query: CommandQuery | undefined;

  protected middleware: Middleware<CommandInput, CommandOutput>[] = [];

  constructor(pathname: string, body?: CommandBody, query?: CommandQuery) {
    this.#pathname = pathname;
    this.#body = body;
    this.#query = query;
  }

  public serialize() {
    return JSON.stringify(this.toJSON());
  }

  public toString(): string {
    return this.serialize();
  }

  public toJSON() {
    return {
      method: this.method,
      pathname: this.#pathname,
      body: this.#body,
      query: this.#query,
    };
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
