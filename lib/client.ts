import type * as s from "@standard-schema/spec";
import type { UnknownRecord } from "type-fest";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import type { Command } from "./command.ts";
import {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "./errors.ts";
import type {
	FetcherMethod,
	ResolvableHeaders,
	ResponseStream,
	RuntimeOptions,
} from "./types.ts";
import { isPlainObject } from "./utils.ts";

const utf8 = new TextEncoder();

// `<` on strings misorders astral characters, and a signing scheme uses bytes
function compareUtf8Bytes(a: string, b: string) {
	const bytesA = utf8.encode(a);
	const bytesB = utf8.encode(b);

	for (const [i, byteA] of bytesA.entries()) {
		const byteB = bytesB[i];

		// b ran out first, so it is a prefix of a
		if (byteB === undefined) {
			return 1;
		}

		if (byteA !== byteB) {
			return byteA - byteB;
		}
	}

	return bytesA.length - bytesB.length;
}

// serializers keep insertion order, so this sets the URL's top-level order
function sortQueryKeys<T extends UnknownRecord>(
	query: T,
	sort: true | ((a: string, b: string) => number),
) {
	const order = sort === true ? compareUtf8Bytes : sort;

	const sorted = Object.entries(query).toSorted(([a], [b]) => order(a, b));

	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reordering keeps the shape
	return Object.fromEntries(sorted) as T;
}

function headersFrom(headers: Record<string, string> | Headers | undefined) {
	return headers instanceof Headers ? Object.fromEntries(headers) : headers;
}

function isStandardSchema<TInput, TOutput>(
	schema: unknown,
): schema is s.StandardSchemaV1<TInput, TOutput> {
	return isPlainObject(schema) && "~standard" in schema;
}

/**
 * Lets a stream's parser validate each item in dev, where the command's class
 * declares a schema. Only the parser sees whole items
 */
export function responseSchemaOf<TInput, TOutput>(
	command: Command<TInput, TOutput>,
) {
	const ctor = command.constructor;
	if (
		"responseSchema" in ctor &&
		isStandardSchema<TInput, TOutput>(ctor.responseSchema)
	) {
		return ctor.responseSchema;
	}
	return;
}

export type RestServiceClientConfig = {
	logger?: ((msg: string, ...args: unknown[]) => void) | undefined;
	headers?: ResolvableHeaders | undefined;
	credentials?: "include" | "omit" | "same-origin" | undefined;
	responseValidator?: ((response: unknown) => boolean) | undefined;
	/**
	 * Orders the query's top-level keys before serialization, so a cache or a
	 * signature keyed on the URL sees the same URL for any order the caller
	 * wrote them in. An object parameter's members keep their order. `true`
	 * sorts by UTF-8 byte order, a comparator by its result
	 */
	sortQuery?: boolean | ((a: string, b: string) => number) | undefined;
} & ({ fetcher?: FetcherMethod } | { fetch?: typeof globalThis.fetch });

export class RestServiceClient<
	// must stay compatible with the Command Input and Output types
	ClientInput = unknown,
	ClientOutput = unknown,
> {
	readonly #base: URL;

	readonly #fetcher: FetcherMethod;

	readonly #headers: ResolvableHeaders | undefined;

	readonly #responseValidator: RestServiceClientConfig["responseValidator"];

	readonly #logger: RestServiceClientConfig["logger"];

	readonly #sortQuery: RestServiceClientConfig["sortQuery"];

	constructor(base: URL | string, config: RestServiceClientConfig = {}) {
		this.#base = new URL(base);
		this.#headers = Object.freeze(config.headers);

		this.#logger = config.logger;
		this.#responseValidator = config.responseValidator;
		this.#sortQuery = config.sortQuery;

		this.#fetcher =
			"fetcher" in config
				? config.fetcher
				: createIsomorphicNativeFetcher(
						"fetch" in config
							? {
									fetch: config.fetch,
								}
							: {},
					);
	}

	#log(msg: string, ...args: unknown[]) {
		this.#logger?.(`[rest-client] ${msg}`, ...args);
	}

	// a schema on the Command is what triggers validation
	async #maybeValidate<
		TInput extends ClientInput,
		TOutput extends ClientOutput,
	>(command: Command<TInput, TOutput>, body: unknown, url: URL) {
		const schema = responseSchemaOf<TInput, TOutput>(command);

		if (!schema) {
			// no schema, so the body is returned as the command declares it
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- by design
			return body as TOutput;
		}

		this.#log("validating response with schema");

		if (this.#responseValidator && !this.#responseValidator(body)) {
			throw new ResponseValidationError(
				command,
				url,
				new Error("Response validation failed"),
			);
		}

		// the schema may transform, so the parsed value replaces the raw body
		const result = await schema["~standard"].validate(body);

		if (result.issues) {
			throw new ResponseValidationError(
				command,
				url,
				PublicValidationError.fromIssues(result.issues),
			);
		}

		return result.value;
	}

	public async response<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(command: Command<InputType, OutputType>, runtimeOptions?: RuntimeOptions) {
		return this.#fetch(command, runtimeOptions, false);
	}

	async #fetch(
		command: Command,
		runtimeOptions: RuntimeOptions | undefined,
		raw: boolean,
	) {
		const { method } = command;

		const url = await this.#buildUrl(command, runtimeOptions);

		this.#log("req: %s %s", method.toUpperCase(), url, runtimeOptions);

		const headers = await this.#resolveHeaders(command, runtimeOptions);

		const result = await this.#fetcher({
			url,
			method,

			...(command.body && {
				body: command.body,
			}),

			headers,

			...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),

			...(raw && { raw }),
		});

		this.#log(
			"res: %d %s %s %s",
			result.res.status,
			result.res.statusText,
			result.res.headers.get("content-type") || "-",
			result.res.headers.get("content-length") || "-",
		);

		return { ...result, url };
	}

	// the runtime hook rewrites the serialized URL, so it runs last
	async #buildUrl(command: Command, runtimeOptions?: RuntimeOptions) {
		const { pathname, query } = command;

		const url = new URL(`.${pathname}`, this.#base);

		if (query) {
			url.search = command.querySerializer(
				this.#sortQuery ? sortQueryKeys(query, this.#sortQuery) : query,
			);
		}

		return runtimeOptions?.url ? new URL(await runtimeOptions.url(url)) : url;
	}

	async #resolveHeaders(command: Command, runtimeOptions?: RuntimeOptions) {
		const resolved = await Promise.all(
			Object.entries(this.#headers ?? {}).map(
				async ([key, valueOrResolver]) => {
					if (typeof valueOrResolver === "function") {
						// binding allows the resolver to access its client via `this`
						const resolver = valueOrResolver.bind(this);
						return [key, await resolver()] as const;
					}

					const value = valueOrResolver;
					return [key, value];
				},
			),
		);

		const clientHeaders = Object.fromEntries(resolved);

		return {
			...clientHeaders,
			...command.headers,
			...headersFrom(runtimeOptions?.headers),
		};
	}

	public async json<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<OutputType> {
		const { res, body, url } = await this.response(command, {
			...runtimeOptions,
			headers: {
				accept: "application/json",
				...headersFrom(runtimeOptions?.headers),
				"content-type": "application/json;charset=utf-8",
			},
		});

		if (res.status < 400) {
			return this.#maybeValidate(command, body, url);
		}

		throw ServiceError.fromResponse(res, body);
	}

	public async send<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<OutputType> {
		const { res, body, url } = await this.response(command, runtimeOptions);

		if (res.status < 400) {
			return this.#maybeValidate(command, body, url);
		}

		throw ServiceError.fromResponse(res, body);
	}

	/**
	 * Resolves a success's body as the response's own byte stream, JSON
	 * included. A status from 400 rejects with a ServiceError, as json() does
	 */
	public async stream<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ResponseStream<OutputType>> {
		const { res, body } = await this.#fetch(command, runtimeOptions, true);

		if (res.status >= 400) {
			// a refusal the fetcher left unparsed still holds the connection
			if (body instanceof ReadableStream) {
				// an errored stream is already released, and the caller needs the
				// refusal, so a cancel failure is only logged
				await body.cancel().catch((err: unknown) => {
					this.#log("refusal body cancel failed", err);
				});
			}

			throw ServiceError.fromResponse(res, body);
		}

		if (body instanceof ReadableStream) {
			return body;
		}

		if (body === null) {
			return new ReadableStream<Uint8Array<ArrayBuffer>>({
				start(controller) {
					controller.close();
				},
			});
		}

		// a custom fetcher that ignores `raw` has already consumed the body
		throw new TypeError(
			"stream() received a parsed body; the fetcher must honour `raw`",
		);
	}
}
