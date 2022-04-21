/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import { URL } from 'node:url';
import type { ApiRequestOptions } from './ApiRequestOptions.js';
import type { ApiResult } from './ApiResult.js';

export type Resolver<T> = (options: ApiRequestOptions) => T | Promise<T>;
type Headers = Record<string, string>;

export type RequestMethod = (
  options: ApiRequestOptions,
  localConfig?: Config,
) => Promise<ApiResult>;

export type Config = {
  BASE: URL;
  VERSION: string;
  WITH_CREDENTIALS?: boolean;
  REQUEST: RequestMethod;
  TOKEN?: string | Resolver<string>;
  USERNAME?: string | Resolver<string>;
  PASSWORD?: string | Resolver<string>;
  HEADERS?: Headers | Resolver<Headers>;
  signal?: AbortSignal;
};

export const OpenAPI: Config = {
  BASE: new URL('https://www.example.com'),
  VERSION: '1',
  REQUEST: () => {
    throw new Error('Implement me');
  },
};
