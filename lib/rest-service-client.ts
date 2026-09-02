import type * as s from "@standard-schema/spec";
import type { Jsonifiable } from "type-fest";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import type { Command } from "./command.ts";
import {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "./errors.ts";
import type {
	FetcherMethod,
	JsonifiableObject,
	ResolvableHeaders,
	RuntimeOptions,
} from "./types.ts";
import { isPlainObject } from "./utils.ts";

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
	return undefined;
}

export type RestServiceClientConfig = {
	logger?: ((msg: string, ...args: unknown[]) => void) | undefined;
	headers?: ResolvableHeaders | undefined;
	credentials?: "include" | "omit" | "same-origin" | undefined;
	responseValidator?: ((response: unknown) => boolean) | undefined;
} & ({ fetcher?: FetcherMethod } | { fetch?: typeof globalThis.fetch });

export class RestServiceClient<
	// WARN: this must be kept compatible with the Command Input and Output types
	ClientInput extends JsonifiableObject | unknown = unknown,
	ClientOutput extends Jsonifiable | unknown = unknown,
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

	// Schema presence on the Command is the sole validation trigger — consumers
	// opt in by importing from the codegen's validated commands file (or via a
	// bundler alias in dev). Lean imports skip schema attachment, valibot never
	// loads, no bundle cost.
	async #maybeValidate<
		TInput extends ClientInput,
		TOutput extends ClientOutput,
	>(
		command: Command<TInput, TOutput>,
		body: unknown,
		url: URL,
	): Promise<TOutput> {
		const schema = getCommandResponseSchema<TInput, TOutput>(command);

		if (!schema) {
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
		const { method, pathname, query } = command;

		const defaultUrl = new URL(`.${pathname}`, this.#base);
		for (const [k, v] of Object.entries(query ?? {})) {
			for (const item of Array.isArray(v) ? v : [v]) {
				if (item !== null && item !== undefined) {
					defaultUrl.searchParams.append(k, item.toString());
				}
			}
		}

		const url = runtimeOptions?.url
			? new URL(await runtimeOptions.url(defaultUrl))
			: defaultUrl;

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

	async #resolveHeaders(command: Command, runtimeOptions?: RuntimeOptions) {
		if (!this.#headers) {
			return {};
		}
		const additionalHeaders = Object.fromEntries(
			await Promise.all(
				Object.entries(this.#headers).map(
					async ([key, valueOrResolver]): Promise<[string, string]> => {
						if (valueOrResolver instanceof Function) {
							const resolver = valueOrResolver.bind(this);
							return [key, await resolver()];
						}

						const value = valueOrResolver;
						return [key, value];
					},
				),
			),
		);

		return {
			...command.headers,
			...additionalHeaders,
			...runtimeOptions?.headers,
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
				...runtimeOptions?.headers,
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
	// fallow-ignore-next-line unused-class-member
	public async stream<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ReadableStream<OutputType>> {
		const { body } = await this.response(command, runtimeOptions);

		if (body instanceof ReadableStream) {
			return body as ReadableStream<OutputType>;
		}

		return new ReadableStream<OutputType>({
			start(controller) {
				controller.enqueue(body as OutputType);
				controller.close();
			},
		});
	}
}
