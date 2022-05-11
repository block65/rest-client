import type { AsyncReturnType } from 'type-fest';
import {
  Config,
  OpenAPI,
  RequestMethod,
  Resolver,
} from './generated/core/OpenAPI.js';

export interface RestServiceClientConfig {
  requestMethod: RequestMethod;
  id: string;
  basePath?: URL | undefined;
  headers?: Record<string, string> | undefined;
  credentials?: 'include' | 'omit' | 'same-origin' | undefined;
  buildId?: string | undefined;
  userAgent?: string | undefined;
  token?: string | Resolver<string> | undefined;
}

export type ApiMethod = (...args: any[]) => Promise<any>;

export class RestServiceClient<T extends ApiMethod = ApiMethod> {
  readonly #config: Config;

  constructor(config: RestServiceClientConfig) {
    this.#config = {
      ...OpenAPI,
      // WITH_CREDENTIALS: !!config.credentials,
      HEADERS: {
        ...config.headers,
        ...(config.userAgent && { 'user-agent': config.userAgent }),
        ...(config.buildId && {
          'x-build-id': `${config.id}/${config.buildId}`,
        }),
      },
      ...(config.basePath && { BASE: config.basePath }),
      VERSION: OpenAPI.VERSION,
      TOKEN: config.token,
      REQUEST: config.requestMethod,
    };
  }

  public async send<M extends T>(
    method: M,
    ...args: Parameters<M>
  ): Promise<AsyncReturnType<M>> {
    return method(
      ...Array.from({ length: method.length - 1 }, (_, idx) => args[idx]),
      this.#config,
    );
  }

  public sendWithAbort<M extends T>(
    method: M,
    ...args: Parameters<M>
  ): [Promise<AsyncReturnType<M>>, AbortController] {
    const controller = new AbortController();

    return [
      method(
        ...Array.from({ length: method.length - 1 }, (_, idx) => args[idx]),
        {
          ...this.#config,
          signal: controller.signal,
        },
      ),
      controller,
    ];
  }

  public sendWithSignal<M extends T>(
    method: M,
    signal: AbortSignal,
    ...args: Parameters<M>
  ): Promise<Awaited<ReturnType<M>>> {
    return method(
      ...Array.from({ length: method.length - 1 }, (_, idx) => args[idx]),
      {
        ...this.#config,
        signal,
      },
    );
  }

  public isAuthenticated() {
    return typeof this.#config.TOKEN !== 'undefined';
  }

  public logOut() {
    delete this.#config.TOKEN;
  }
}
