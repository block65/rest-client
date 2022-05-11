/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApiRequestOptions } from './ApiRequestOptions.js';
import type { ApiResult } from './ApiResult.js';

export type Resolver<T> = (options: ApiRequestOptions) => T | Promise<T>;
type Headers = Record<string, string>;

export type RequestMethod = (
  options: ApiRequestOptions,
  localConfig?: Config | undefined,
) => Promise<ApiResult>;

export type Config = {
  BASE: URL;
  VERSION: string;
  REQUEST: RequestMethod;
  WITH_CREDENTIALS?: boolean | undefined;
  TOKEN?: string | Resolver<string> | undefined;
  USERNAME?: string | Resolver<string> | undefined;
  PASSWORD?: string | Resolver<string> | undefined;
  HEADERS?: Headers | Resolver<Headers> | undefined;
  signal?: AbortSignal;
};

export const OpenAPI: Config = {
  BASE: new URL('https://www.example.com'),
  VERSION: '1',
  REQUEST: () => {
    throw new Error('Implement me');
  },
};
