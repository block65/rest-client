import { CustomError, type CustomErrorSerialized } from '@block65/custom-error';
import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { Command } from './command.js';
import { hackyConvertDates, resolveHeaders } from './common.js';
import { ServiceError } from './errors.js';
import type {
  FetcherMethod,
  ResolvableHeaders,
  RuntimeOptions,
} from './types.js';
import { isPlainObject } from './utils.js';

export interface RestServiceClientConfig {
  headers?: ResolvableHeaders | undefined;
  credentials?: 'include' | 'omit' | 'same-origin' | undefined;
}

export class RestServiceClient<
  ClientInput extends JsonifiableObject | void = void,
  ClientOutput extends Jsonifiable | void = void,
> {
  readonly #config: RestServiceClientConfig;

  readonly #base: URL;

  readonly #fetcher: FetcherMethod;

  public async response<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ) {
    const { method, pathname, query, body } = command;

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
        ...runtimeOptions?.headers,
        ...this.#config.headers,
      }),
      ...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
    });
  }

  public async json<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    const res = await this.response(command, runtimeOptions);

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

  /**
   * @deprecated
   * @see {json}
   */
  public async send<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    return this.json(command, runtimeOptions);
  }

  public async stream<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ) {
    const res = await this.response(command, runtimeOptions);

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
