import type { HttpMethod } from './generated/models.js';
import type { Resolver } from './utils.js';

export type ResolvableHeaders = Record<string, string | Resolver<string>>;

export type FetcherParams<T = unknown> = {
  url: URL;
  method: HttpMethod;
  body?: T;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  signal?: AbortSignal;
};

export type FetcherResponse<T> = {
  body?: T;
  url: URL;
  status: number;
  statusText: string;
  ok: boolean;
};

export type FetcherMethod<T = unknown> = (
  params: FetcherParams,
) => Promise<FetcherResponse<T>>;
