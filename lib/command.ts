import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { HttpMethod } from './types.js';

export abstract class Command<
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  _CommandInput extends JsonifiableObject | void = void,
  CommandOutput extends Jsonifiable | void = void,
  CommandBody extends Jsonifiable | void = void,
  CommandQuery extends JsonifiableObject | void = void,
> {
  public method: HttpMethod = 'get';

  #pathname: string;

  #body: CommandBody;

  #query: CommandQuery;

  protected middlewareStack: CommandOutput[] = [];

  constructor(pathname: string, body: CommandBody, query: CommandQuery) {
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
