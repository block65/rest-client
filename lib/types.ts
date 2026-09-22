import type { Jsonifiable } from "type-fest";

export type JsonifiableObject =
	| { [Key in string]?: Jsonifiable }
	| { toJSON: () => Jsonifiable };

export type Resolver<T = unknown> = () => T | Promise<T>;

export type ResolvableHeaders = Record<string, string | Resolver<string>>;

export type FetcherParams = {
	body?: RequestInit["body"] | Uint8Array | null;
	url: URL;
	method: HttpMethod;
	headers?: Record<string, string>;
	credentials?: "include" | "omit" | "same-origin";
	signal?: AbortSignal;
};

export type FetcherResponse<T = unknown> = {
	body?: T;
	url: URL;
	res: Response;
};

export type FetcherMethod = (
	params: FetcherParams,
) => Promise<FetcherResponse<ReadableStream<Uint8Array> | null | Jsonifiable>>;

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "head";

/**
 * Writes one query parameter as unencoded name and value pairs. Each OAS
 * 3.2 style and explode combination a document can state is one encoder
 */
export type QueryEncoder = (
	name: string,
	value: unknown,
) => (readonly [name: string, value: string])[];

/** Turns a command's query object into the search string after the `?` */
export type QuerySerializer = (query: Record<string, unknown>) => string;

export type RequestMethod<T = any> = (
	params: RequestParameters,
	options?: RuntimeOptions,
) => Promise<T>;

export type RequestParameters = {
	pathname: string;
	method: HttpMethod;
	query?: Record<string, string | number | (string | number)[]> | undefined;
	body?: unknown;
	headers?: Record<string, string> | Headers | undefined;
};

export type RuntimeOptions = {
	/**
	 * Override the request URL for this call. Receives the URL built from
	 * base, pathname and query, and returns the final URL, used as given.
	 * Suits one-off targets such as presigned upload URLs
	 */
	url?: ((url: URL) => URL | string | Promise<URL | string>) | undefined;
	headers?: Record<string, string> | undefined | Headers;
	signal?: AbortSignal;
	/** @deprecated  */
	json?: boolean;
};

export type RequestMethodCaller<T = unknown> = (
	requestMethod: RequestMethod<T>,
	options?: RuntimeOptions,
) => Promise<T>;
