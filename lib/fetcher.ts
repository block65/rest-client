import type { Jsonifiable } from 'type-fest';
import type { HttpMethod } from './types.js';
import type { Resolver } from './utils.js';

export type ResolvableHeaders = Record<string, string | Resolver<string>>;

export type FetcherParams<T = unknown> = {
  body?: T;
  url: URL;
  method: HttpMethod;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  signal?: AbortSignal;
};

/** @deprecated */
export type LegacyFetcherResponse<T> = {
  body?: T;
  url: URL;
  status: number;
  statusText: string;
  ok: boolean;
};

/** @deprecated */
export type LegacyFetcherMethod<T = unknown> = (
  params: FetcherParams,
) => Promise<LegacyFetcherResponse<T>>;

export type FetcherResponse<
  T extends ReadableStream<Uint8Array> | null | unknown | string = unknown,
> = {
  body?: T;
  url: URL;
  status: number;
  statusText: string;
  ok: boolean;
};

export type FetcherMethod = (
  params: FetcherParams,
) => Promise<FetcherResponse<ReadableStream<Uint8Array> | null | Jsonifiable>>;
