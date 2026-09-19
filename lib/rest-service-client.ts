import type * as s from "@standard-schema/spec";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import type { Command } from "./command.ts";
import {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "./errors.ts";
import type {
	FetcherMethod,
	QueryStyles,
	ResolvableHeaders,
	RuntimeOptions,
} from "./types.ts";
import { isPlainObject, toJsonValue } from "./utils.ts";

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

// a plain object skips toJSON, which is a legal member name in a query object
function resolveQueryValue(input: unknown) {
	return isPlainObject(input) ? input : toJsonValue(input);
}

// each parameter takes the style and explode of OAS 3.2 §4.12.6
function appendSearchParams(
	target: URLSearchParams,
	query: Record<string, unknown> | undefined,
	styles: QueryStyles | undefined,
) {
	// a Blob, a ReadableStream or a toJSON-less class instance supplies toString
	const appendScalar = (name: string, value: unknown) => {
		target.append(name, String(value));
	};

	// one key per member or item, hoisting a nested object past what OAS covers
	const appendExploded = (name: string, input: unknown) => {
		const value = resolveQueryValue(input);

		// an invalid Date reaches here, its toJSON having returned null
		if (value === null || value === undefined) {
			return;
		}

		if (Array.isArray(value)) {
			for (const item of value) {
				appendExploded(name, item);
			}

			return;
		}

		if (isPlainObject(value)) {
			for (const [member, memberValue] of Object.entries(value)) {
				appendExploded(member, memberValue);
			}

			return;
		}

		appendScalar(name, value);
	};

	// one value holds an array's items, or an object's alternating name and value
	const appendJoined = (name: string, input: unknown, delimiter: string) => {
		const value = resolveQueryValue(input);

		if (value === null || value === undefined) {
			return;
		}

		let parts: unknown[] = [value];

		if (Array.isArray(value)) {
			parts = value;
		} else if (isPlainObject(value)) {
			parts = Object.entries(value).flat();
		}

		const usable = parts.filter((part) => part !== null && part !== undefined);

		if (usable.length > 0) {
			appendScalar(
				name,
				usable.map((part) => String(resolveQueryValue(part))).join(delimiter),
			);
		}
	};

	// deepObject brackets each member under the parent name, as ?at[gt]=1
	const appendDeep = (name: string, input: unknown, nestedInArray: boolean) => {
		const value = resolveQueryValue(input);

		if (value === null || value === undefined) {
			return;
		}

		if (Array.isArray(value)) {
			const indexed =
				nestedInArray ||
				value.some((item) => isPlainObject(item) || Array.isArray(item));

			value.forEach((item, index) => {
				appendDeep(indexed ? `${name}[${index}]` : name, item, true);
			});

			return;
		}

		if (isPlainObject(value)) {
			for (const [member, memberValue] of Object.entries(value)) {
				appendDeep(`${name}[${member}]`, memberValue, false);
			}

			return;
		}

		appendScalar(name, value);
	};

	const delimiters = { spaceDelimited: " ", pipeDelimited: "|" } as const;

	for (const [name, value] of Object.entries(query ?? {})) {
		const { style = "form", explode = true } = styles?.[name] ?? {};

		if (style === "deepObject") {
			appendDeep(name, value, false);
		} else if (explode) {
			appendExploded(name, value);
		} else {
			appendJoined(name, value, style === "form" ? "," : delimiters[style]);
		}
	}
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
			// TYPESAFETY: validation runs only against a schema on the Command, so
			// an absent one leaves the caller's declared TOutput standing
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
		const { method, pathname, query, querySerializer, queryStyles } = command;

		const defaultUrl = new URL(`.${pathname}`, this.#base);

		if (querySerializer && query) {
			defaultUrl.search = querySerializer(query);
		} else {
			appendSearchParams(defaultUrl.searchParams, query, queryStyles);
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
	public async stream<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<ReadableStream<OutputType>> {
		const { body } = await this.response(command, runtimeOptions);

		if (body instanceof ReadableStream) {
			// TYPESAFETY: the fetcher yields the response body stream untyped, and
			// OutputType is what the caller declared its chunks to be
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion
			return body as ReadableStream<OutputType>;
		}

		return new ReadableStream<OutputType>({
			start(controller) {
				// TYPESAFETY: a non-stream body is the parsed response, which the
				// caller declared as OutputType
				// oxlint-disable-next-line typescript/no-unsafe-type-assertion
				controller.enqueue(body as OutputType);
				controller.close();
			},
		});
	}
}
