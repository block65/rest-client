import { CustomError, type CustomErrorSerialized } from '@block65/custom-error';
import { Command } from './command.js';
import { hackyConvertDates, resolveHeaders } from './common.js';
import { ServiceError } from './errors.js';
import type { FetcherMethod, ResolvableHeaders } from './fetcher.js';
import type { RuntimeOptions } from './types.js';
import { isPlainObject } from './utils.js';

export interface RestServiceClientConfig {
  headers?: ResolvableHeaders | undefined;
  credentials?: 'include' | 'omit' | 'same-origin' | undefined;
}

export class RestServiceClient<
  ClientInput extends Record<string, unknown> | void = void,
  ClientOutput extends Record<string, unknown> | void = void,
> {
  readonly #config: RestServiceClientConfig;

  readonly #base: URL;

  readonly #fetcher: FetcherMethod;

  async #res<InputType extends ClientInput, OutputType extends ClientOutput>(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ) {
    const { method, pathname, /* query, */ body } = command;
    const query = undefined;

    const url = new URL(`.${pathname}`, this.#base);
    url.search = query
      ? new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, v?.toString() || '']),
        ).toString()
      : '';

    return this.#fetcher({
      url,
      method,
      body,
      headers: await resolveHeaders({
        // ...headers,
        ...this.#config.headers,
      }),
      ...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
    });
  }

  public async send<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    const res = await this.#res(command, runtimeOptions);

    if (res.status >= 400) {
      if (
        isPlainObject(res.body) &&
        'code' in res.body &&
        'status' in res.body
      ) {
        throw CustomError.fromJSON(
          res.body as unknown as CustomErrorSerialized,
        );
      }
      throw new ServiceError(res.statusText).debug({ res });
    }

    return hackyConvertDates(res.body) as OutputType;
  }

  public async stream<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(command: Command<InputType, OutputType>, runtimeOptions?: RuntimeOptions) {
    const res = await this.#res(command, runtimeOptions);

    if (res.status >= 400) {
      throw new ServiceError(res.statusText).debug({ res });
    }

    if (res.body instanceof ReadableStream) {
      const reader = res.body?.getReader();
      return reader;
    }
    throw new ServiceError('Unstreamable response').debug({ res });
  }

  constructor(
    base: URL,
    fetcher: FetcherMethod,
    config: RestServiceClientConfig = {},
  ) {
    this.#config = config;

    this.#base = base;

    this.#fetcher = fetcher;
  }
}
