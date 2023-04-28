import { type HttpMethod } from './types.js';

export abstract class Command<
  CommandInput extends Record<string, unknown> | void = void,
  CommandOutput extends Record<string, unknown> | void = void,
  CommandBody extends Record<string, unknown> | void = Partial<CommandInput>,
> {
  public method: HttpMethod = 'get';

  #pathname: string;

  #body: CommandBody;

  protected middlewareStack: CommandOutput[] = [];

  constructor(pathname: string, input: CommandBody) {
    this.#pathname = pathname;
    this.#body = input;
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
    };
  }

  public get body() {
    return this.#body;
  }

  public get pathname() {
    return this.#pathname;
  }
}
