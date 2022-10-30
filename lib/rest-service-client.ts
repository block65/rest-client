import { CustomError, type CustomErrorSerialized } from '@block65/custom-error';
import { hackyConvertDates } from '../lib/common.js';
import { ServiceError } from './errors.js';
import type { FetcherMethod, ResolvableHeaders } from './fetcher.js';
import type {
  RequestMethodCaller,
  RuntimeOptions,
} from './generated/models.js';
import { isPlainObject } from './utils.js';

export interface RestServiceClientConfig {
  headers?: ResolvableHeaders | undefined;
  credentials?: 'include' | 'omit' | 'same-origin' | undefined;
}

export class RestServiceClient {
  readonly #config: RestServiceClientConfig;

  readonly #base: URL;

  readonly #fetcher: FetcherMethod<unknown>;

  constructor(
    base: URL,
    fetcher: FetcherMethod,
    config: RestServiceClientConfig = {},
  ) {
    this.#config = config;

    this.#base = base;

    this.#fetcher = fetcher;
  }

  public send<T>(
    fn: RequestMethodCaller<T>,
    options?: RuntimeOptions,
  ): Promise<T> {
    return fn(async (params, runtimeOptions) => {
      const { method, pathname, query, body, headers } = params;

      const url = new URL(`.${pathname}`, this.#base);
      url.search = query
        ? new URLSearchParams(
            Object.entries(query).map(([k, v]) => [k, v.toString()]),
          ).toString()
        : '';

      const res = await this.#fetcher({
        url,
        method,
        body,
        headers: {
          ...headers,
          ...this.#config.headers,
        },
        }),
        ...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
      });

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

      return hackyConvertDates(res.body) as T;
    }, options);
  }
}
