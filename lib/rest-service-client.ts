import { CustomError, type CustomErrorSerialized } from '@block65/custom-error';
import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { Command } from './command.js';
import { resolveHeaders } from './common.js';
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
    const { method, pathname, query } = command;

    const url = new URL(`.${pathname}`, this.#base);
    url.search = query
      ? new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, v?.toString() || '']),
        ).toString()
      : '';

    return this.#fetcher({
      url,
      method,
      body:
        command.body && runtimeOptions?.json
          ? JSON.stringify(command.body)
          : null,
      headers: await resolveHeaders({
        ...runtimeOptions?.headers,
        ...this.#config.headers,
        ...(runtimeOptions?.json && {
          'content-type': 'application/json;charset=utf-8',
        }),
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
    const res = await this.response(command, {
      ...runtimeOptions,
      json: true,
    });

    if (res.status < 400) {
      return res.body as OutputType;
    }

    if (isPlainObject(res.body) && 'code' in res.body && 'status' in res.body) {
      throw CustomError.fromJSON(res.body as unknown as CustomErrorSerialized).addDetail(
        {
          reason: `http-${res.status}`,
          metadata: {
            status: res.status.toString(),
            statusText: res.statusText,
          },
        }
      );
    }
    throw new ServiceError(res.statusText).debug({ res });
  }

  public async send<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    const res = await this.response(command, runtimeOptions);

    if (res.status < 400) {
      return res.body as OutputType;
    }

    throw new ServiceError(res.statusText).debug({ res });
  }

  public async stream<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType, any, any>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<ReadableStreamDefaultReader<OutputType>> {
    const body = await this.response(command, runtimeOptions);

    if (body instanceof ReadableStream) {
      const reader = body?.getReader();
      return reader;
    }
    throw new ServiceError('Unstreamable response').debug({ body });
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
