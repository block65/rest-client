import type { UnknownRecord } from "type-fest";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import { type Command } from "./commands/command.ts";
import { SequentialMediaCommand } from "./commands/sequential-media.ts";
import { ResponseValidationError, ServiceError } from "./errors.ts";
import type {
	FetcherMethod,
	ResolvableHeaders,
	RuntimeOptions,
} from "./types.ts";

const utf8 = new TextEncoder();

// code point order, where `<` misorders astral characters as UTF-16 units
function utf8Compare(a: string, b: string) {
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
	const compare = compareFnOrBool === true ? utf8Compare : compareFnOrBool;

	const sorted = Object.entries(query).toSorted(([a], [b]) => compare(a, b));

	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reordering keeps the shape
	return Object.fromEntries(sorted) as T;
}

function toHeaders(headers: Record<string, string> | Headers | undefined) {
	return headers instanceof Headers ? Object.fromEntries(headers) : headers;
}

// stream() yields items, so json() and send() refuse a sequential command
type NotSequential = { readonly "~sequential"?: never };

function toByteStream(body: unknown) {
	if (body instanceof ReadableStream) {
		// instanceof gives ReadableStream<any>, and FetcherMethod types a raw body
		// as bytes
		return body as ReadableStream<Uint8Array<ArrayBuffer>>;
	}

	// a fetcher may leave a bodiless response's body unset
	if (body === null || body === undefined) {
		return new ReadableStream<Uint8Array<ArrayBuffer>>({
			start(controller) {
				controller.close();
			},
		});
	}

	// a parsed body means the fetcher ignored `raw`, and its bytes are consumed
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
	 * Orders the query's top-level keys before serialization, so a query gives
	 * the same URL for any order of its keys. An object
	 * parameter's members keep their order. `true`
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

	async #parseBody<TInput extends ClientInput, TOutput extends ClientOutput>(
		command: Command<TInput, TOutput>,
		res: Response,
		fetchedBody: unknown,
		url: URL,
	) {
		// a bodiless response, a 204 say, resolves undefined. A JSON null was
		// read from a body, so its res.body is still set and it stays null
		const body =
			fetchedBody === null && res.body === null ? undefined : fetchedBody;

		if (this.#responseValidator && !this.#responseValidator(body)) {
			throw new ResponseValidationError(
				command,
				url,
				new Error("Response validation failed"),
			);
		}

		try {
			return await command.parseBody(body);
		} catch (err) {
			throw new ResponseValidationError(command, url, err);
		}
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
		// command headers override client headers, and either may be a resolver
		const resolved = await Promise.all(
			Object.entries({ ...this.#headers, ...command.headers }).map(
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

		return {
			...Object.fromEntries(resolved),
			...toHeaders(runtimeOptions?.headers),
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
				...toHeaders(runtimeOptions?.headers),
				"content-type": "application/json;charset=utf-8",
			},
		});

		if (res.status < 400) {
			return this.#parseBody(command, res, body, url);
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
			return this.#parseBody(command, res, body, url);
		}

		throw ServiceError.fromResponse(res, body);
	}

	/**
	 * Resolves with the body's bytes, unparsed, JSON included. A sequential
	 * media command's bytes are parsed into its items, and a parse failure
	 * errors the stream. A status of 400 or above rejects with a ServiceError
	 */
	public stream<InputType extends ClientInput, ItemType extends ClientOutput>(
		command: Command<InputType, ItemType> & { readonly "~sequential": true },
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
							...toHeaders(runtimeOptions?.headers),
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

		return sequential.parse(bytes, url);
	}
}
