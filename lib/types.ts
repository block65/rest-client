import type { Jsonifiable } from 'type-fest';

export type Resolver<T = unknown> = () => T | Promise<T>;

export type ResolvableHeaders = Record<string, string | Resolver<string>>;

export type FetcherParams = {
  body?: BodyInit | null;
  url: URL;
  method: HttpMethod;
  headers?: Record<string, string>;
  credentials?: 'include' | 'omit' | 'same-origin';
  signal?: AbortSignal;
};

export type FetcherResponse<
  T extends ReadableStream<Uint8Array> | null | unknown | string = unknown,
> = {
  body?: T;
  url: URL;
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
};

export type FetcherMethod = (
  params: FetcherParams,
) => Promise<FetcherResponse<ReadableStream<Uint8Array> | null | Jsonifiable>>;

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'head';

export type RequestMethod<T = any> = (
  params: RequestParameters,
  options?: RuntimeOptions,
) => Promise<T>;

export type RequestParameters = {
  pathname: string;
  method: HttpMethod;
  query?: Record<string, string | number | (string | number)[]> | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
};

export type RuntimeOptions = {
  headers?: Record<string, string> | undefined;
  signal?: AbortSignal;
  json?: boolean;
};

export type RequestMethodCaller<T = unknown> = (
  requestMethod: RequestMethod<T>,
  options?: RuntimeOptions,
) => Promise<T>;
