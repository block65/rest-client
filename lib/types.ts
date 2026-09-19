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
 * How a query parameter is written into a query string, from the `style` and
 * `explode` the OpenAPI document states for it. A generated command lists a
 * parameter here when its document departs from the OAS default of `form` with
 * `explode: true`. An unlisted parameter uses that default
 */
export type QueryParameterStyle =
	| "form"
	| "spaceDelimited"
	| "pipeDelimited"
	| "deepObject";

export type QueryParameterEncoding = {
	style: QueryParameterStyle;
	explode: boolean;
};

export type QueryStyles = Readonly<Record<string, QueryParameterEncoding>>;

/**
 * What a receiver needs to read a query parameter back. `type` selects
 * between an array's items and an object's members when one joined value
 * holds both. `members` names the parts to collect for `form` with
 * `explode`, which omits the parent name from the wire. Object and array
 * parameters take a spec
 */
export type QueryParamSpec = QueryParameterEncoding & {
	readonly name: string;
	readonly type: "object" | "array";
	readonly members?: readonly string[];
};

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
	/**
	 * Override the request URL for this call. Receives the URL built from
	 * base, pathname and query, and returns the final URL, used as given.
	 * Suits one-off targets such as presigned upload URLs
	 */
	url?: ((url: URL) => URL | string | Promise<URL | string>) | undefined;
	headers?: Record<string, string> | undefined;
	signal?: AbortSignal;
	/** @deprecated  */
	json?: boolean;
};

export type RequestMethodCaller<T = unknown> = (
	requestMethod: RequestMethod<T>,
	options?: RuntimeOptions,
) => Promise<T>;
