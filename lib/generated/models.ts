/**
 * This file is auto generated.
 *
 * WARN: Do not edit directly.
 *
 * Generated on 2022-09-07T12:48:13.446Z
 *
 */
export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'head';
export type RequestParams = {
  method: HttpMethod;
  pathname: string;
  query?: Record<string, string | number> | undefined;
  body?: unknown;
  headers?: Record<string, string>;
};

export type RuntimeOptions = {
  signal?: AbortSignal;
};
export type RequestMethod<T = any> = (
  params: RequestParams,
  options?: RuntimeOptions,
) => Promise<T>;
export type RequestMethodCaller<T = unknown> = (
  requestMethod: RequestMethod<T>,
  options?: RuntimeOptions,
) => Promise<T>;
