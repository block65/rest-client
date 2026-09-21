import type * as s from "@standard-schema/spec";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import type { Command } from "./command.ts";
import {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "./errors.ts";
import { createStyledSerializer } from "./query-serializer.ts";
import type {
	FetcherMethod,
	ResolvableHeaders,
	RuntimeOptions,
} from "./types.ts";
import { isPlainObject } from "./utils.ts";

// spreading an iterable Headers into an object drops every header
function headerRecord(headers: Record<string, string> | Headers | undefined) {
	return headers instanceof Headers ? Object.fromEntries(headers) : headers;
}

function isStandardSchema<TInput, TOutput>(
	schema: unknown,
): schema is s.StandardSchemaV1<TInput, TOutput> {
	return isPlainObject(schema) && "~standard" in schema;
}

function getCommandResponseSchema<TInput, TOutput>(
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

	constructor(base: URL | string, config: RestServiceClientConfig = {}) {
		this.#base = new URL(base);
		this.#headers = Object.freeze(config.headers);

		this.#logger = config.logger;
		this.#responseValidator = config.responseValidator;

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

	// a schema on the Command is what triggers validation and loads valibot
	async #maybeValidate<
		TInput extends ClientInput,
		TOutput extends ClientOutput,
	>(command: Command<TInput, TOutput>, body: unknown, url: URL) {
		const schema = getCommandResponseSchema<TInput, TOutput>(command);

		if (!schema) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- without a schema nothing narrows TOutput
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
		const { pathname, query, querySerializer, queryStyles } = command;

		const url = new URL(`.${pathname}`, this.#base);

		if (query) {
			url.search = (querySerializer ?? createStyledSerializer(queryStyles))(
				query,
			);
		}

		return runtimeOptions?.url ? new URL(await runtimeOptions.url(url)) : url;
	}

	async #resolveHeaders(command: Command, runtimeOptions?: RuntimeOptions) {
		const resolved = await Promise.all(
			Object.entries(this.#headers ?? {}).map(
				async ([key, valueOrResolver]) => {
					if (typeof valueOrResolver === "function") {
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
			...headerRecord(runtimeOptions?.headers),
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
				...headerRecord(runtimeOptions?.headers),
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

	// public API for streaming responses
	public async stream<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ReadableStream<OutputType>> {
		const { body } = await this.response(command, runtimeOptions);

		if (body instanceof ReadableStream) {
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the fetcher types the stream's chunks as Uint8Array
			return body as ReadableStream<OutputType>;
		}

		return new ReadableStream<OutputType>({
			start(controller) {
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a non-stream body is the parsed response
				controller.enqueue(body as OutputType);
				controller.close();
			},
		});
	}
}
