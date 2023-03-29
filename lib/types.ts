export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'head';

export type RequestParameters = {
  pathname: string;
  method: HttpMethod;
  query?: Record<string, string | number | (string | number)[]> | undefined;
  body?: unknown;
  headers?: Record<string, string> | undefined;
};

export type RuntimeOptions = {
  signal?: AbortSignal;
};

export type RequestMethod<T = any> = (
  params: RequestParameters,
  options?: RuntimeOptions,
) => Promise<T>;

export type RequestMethodCaller<T = unknown> = (
  requestMethod: RequestMethod<T>,
  options?: RuntimeOptions,
) => Promise<T>;
