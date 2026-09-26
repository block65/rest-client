import type * as s from "@standard-schema/spec";
import type { UnknownRecord } from "type-fest";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import { type Command, SequentialMediaCommand } from "./command.ts";
import {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "./errors.ts";
import type {
	FetcherMethod,
	ResolvableHeaders,
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
	compareFnOrBool: true | ((a: string, b: string) => number),
) {
	const compare = compareFnOrBool === true ? compareUtf8Bytes : compareFnOrBool;

	const sorted = Object.entries(query).toSorted(([a], [b]) => compare(a, b));

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

// a static on the command's class, inherited statics included
function maybeStaticSchema<TInput, TOutput>(
	command: Command,
	name: "responseSchema" | "itemSchema",
) {
	const schema: unknown = Reflect.get(command.constructor, name);

	return isStandardSchema<TInput, TOutput>(schema) ? schema : undefined;
}

/**
 * Finds a `responseSchema` on the command's class. json() and send()
 * validate a whole body with it
 */
export function maybeResponseSchema<TInput, TOutput>(
	command: Command<TInput, TOutput>,
) {
	return maybeStaticSchema<TInput, TOutput>(command, "responseSchema");
}

// a sequential media type's item schema, per OpenAPI 3.2's itemSchema
function maybeItemSchema<TInput, TItem>(
	command: SequentialMediaCommand<TInput, TItem>,
) {
	return maybeStaticSchema<TItem, TItem>(command, "itemSchema");
}

// stream() yields items, so json() and send() refuse a sequential command
type NotSequential = { readonly "~sequential"?: never };

function toByteStream(body: unknown) {
	if (body instanceof ReadableStream) {
		return body as ReadableStream<Uint8Array<ArrayBuffer>>;
	}

	if (body === null) {
		return new ReadableStream<Uint8Array<ArrayBuffer>>({
			start(controller) {
				controller.close();
			},
		});
	}

	// a fetcher that ignores `raw` hands over a parsed body, its bytes spent
	throw new TypeError(
		"stream() received a parsed body; the fetcher must honour `raw`",
	);
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
		const schema = maybeResponseSchema<TInput, TOutput>(command);

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

		const result = await schema["~standard"].validate(body);

		if (result.issues) {
			throw new ResponseValidationError(
				command,
				url,
				PublicValidationError.fromIssues(result.issues),
			);
		}

		// the schema may transform, so its output replaces the body
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
		command: Command<InputType, OutputType> & NotSequential,
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
		command: Command<InputType, OutputType> & NotSequential,
		runtimeOptions?: RuntimeOptions,
	): Promise<OutputType> {
		const { res, body, url } = await this.response(command, runtimeOptions);

		if (res.status < 400) {
			return this.#maybeValidate(command, body, url);
		}

		throw ServiceError.fromResponse(res, body);
	}

	/**
	 * Resolves with the body's bytes, unparsed, JSON included. A sequential
	 * media command's bytes are parsed into its items, each checked against
	 * the class's `itemSchema` where it declares one. A status of 400 or above
	 * rejects with a ServiceError
	 */
	public stream<InputType extends ClientInput, ItemType extends ClientOutput>(
		command: SequentialMediaCommand<InputType, ItemType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ReadableStream<ItemType>>;

	public stream<InputType extends ClientInput, OutputType extends ClientOutput>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ReadableStream<Uint8Array<ArrayBuffer>>>;

	public async stream(command: Command, runtimeOptions?: RuntimeOptions) {
		const sequential =
			command instanceof SequentialMediaCommand ? command : undefined;

		const { res, body, url } = await this.#fetch(
			command,
			sequential
				? {
						...runtimeOptions,
						headers: {
							accept: sequential.mediaType,
							...headersFrom(runtimeOptions?.headers),
						},
					}
				: runtimeOptions,
			true,
		);

		if (res.status >= 400) {
			if (body instanceof ReadableStream) {
				// an unread body holds its connection until cancelled. An errored
				// stream is already released, so a failed cancel is only logged
				// and the ServiceError still throws
				await body.cancel().catch((err: unknown) => {
					this.#log("refusal body cancel failed", err);
				});
			}

			throw ServiceError.fromResponse(res, body);
		}

		const bytes = toByteStream(body);

		if (!sequential) {
			return bytes;
		}

		const items = sequential.parse(bytes);
		const schema = maybeItemSchema(sequential);

		if (!schema) {
			return items;
		}

		return items.pipeThrough(
			new TransformStream({
				async transform(item, controller) {
					const result = await schema["~standard"].validate(item);

					// a rejected transform errors the stream with its reason
					if (result.issues) {
						throw new ResponseValidationError(
							command,
							url,
							PublicValidationError.fromIssues(result.issues),
						);
					}

					controller.enqueue(result.value);
				},
			}),
		);
	}
}
