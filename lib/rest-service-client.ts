import { CustomError, type CustomErrorSerialized } from '@block65/custom-error';
import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import { createIsomorphicNativeFetcher } from '../src/fetchers/isomorphic-native-fetcher.js';
import type { Command } from './command.js';
import { resolveHeaders } from './common.js';
import { ServiceError } from './errors.js';
import type {
  FetcherMethod,
  ResolvableHeaders,
  RuntimeOptions,
} from './types.js';
import { isPlainObject } from './utils.js';

export type RestServiceClientConfig = {
  logger?: ((...args: unknown[]) => void) | undefined;
  headers?: ResolvableHeaders | undefined;
  credentials?: 'include' | 'omit' | 'same-origin' | undefined;
} & ({ fetcher?: FetcherMethod } | { fetch?: typeof globalThis.fetch });

export class RestServiceClient<
  // WARN: this must be kept compatible with the Command Input and Output types
  ClientInput extends JsonifiableObject | unknown = unknown,
  ClientOutput extends Jsonifiable | unknown = unknown,
> {
  readonly #base: URL;

  readonly #fetcher: FetcherMethod;

  readonly #headers: ResolvableHeaders | undefined;

  #logger: ((...args: unknown[]) => void) | undefined;

  constructor(base: URL | string, config: RestServiceClientConfig = {}) {
    this.#base = new URL(base);
    this.#headers = Object.freeze(config.headers);

    this.#logger = config.logger;

    this.#fetcher =
      'fetcher' in config
        ? config.fetcher
        : createIsomorphicNativeFetcher(
            'fetch' in config
              ? {
                  fetch: config.fetch,
                }
              : {},
          );
  }

  #log(msg: string, ...args: unknown[]) {
    this.#logger?.(`[rest-client] ${msg}`, ...args);
  }

  public async response<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(command: Command<InputType, OutputType>, runtimeOptions?: RuntimeOptions) {
    const { method, pathname, query } = command;

    const url = new URL(`.${pathname}`, this.#base);
    url.search = query
      ? new URLSearchParams(
          Object.entries(query).map(([k, v]) => [k, v?.toString() || '']),
        ).toString()
      : '';

    this.#log('req: %s %s', method.toUpperCase(), url, runtimeOptions);

    const res = await this.#fetcher({
      url,
      method,
      body:
        command.body && runtimeOptions?.json
          ? JSON.stringify(command.body)
          : null,
      headers: await resolveHeaders({
        ...runtimeOptions?.headers,
        ...this.#headers,
        ...(runtimeOptions?.json && {
          'content-type': 'application/json;charset=utf-8',
        }),
      }),
      ...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
    });

    this.#log(
      'res: %d %s %s %s',
      res.status,
      res.statusText,
      res.headers.get('content-type') || '-',
      res.headers.get('content-length') || '-',
    );

    return res;
  }

  public async json<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType>,
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
      throw CustomError.fromJSON(
        res.body as unknown as CustomErrorSerialized,
      ).addDetail({
        reason: `http-${res.status}`,
        metadata: {
          status: res.status.toString(),
          statusText: res.statusText,
        },
      });
    }
    throw new ServiceError(res.statusText).debug({ res });
  }

  public async send<
    InputType extends ClientInput,
    OutputType extends ClientOutput,
  >(
    command: Command<InputType, OutputType>,
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
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<ReadableStreamDefaultReader<OutputType>> {
    const body = await this.response(command, runtimeOptions);

    if (body instanceof ReadableStream) {
      const reader = body?.getReader();
      return reader;
    }
    throw new ServiceError('Unstreamable response').debug({ body });
  }
}
