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

// Consulted once, where JSON.stringify consults it, so a toJSON that returns
// `this` terminates. A plain object skips it, because `toJSON` is a legal
// member name in a query object
function resolveQueryValue(input: unknown): unknown {
	return isPlainObject(input) ? input : toJsonValue(input);
}

// Each parameter follows the `style` and `explode` its OpenAPI document states
// for it, per the Style Examples table in OAS 3.2 §4.12.6. `queryStyles` lists
// the parameters that depart from the OAS default of form with explode; the
// rest use that default. Under the default an object loses its parent name, so
// two object parameters sharing a member name arrive identical. The generator
// warns about that, and about the pairs §4.12.6 marks n/a
function appendSearchParams(
	target: URLSearchParams,
	query: Record<string, unknown> | undefined,
	styles: QueryStyles | undefined,
) {
	// A Blob, a ReadableStream, or a class instance lacking toJSON reaches here,
	// and each one supplies its toString
	function appendScalar(name: string, value: unknown) {
		target.append(name, String(value));
	}

	// Every member and item takes a key of its own. An object uses its member
	// names, an array repeats the parameter name. A nested object is hoisted
	// again, which reaches past what the spec covers
	function appendExploded(name: string, input: unknown) {
		const value = resolveQueryValue(input);

		// an invalid Date reaches here, because its toJSON answers null
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
	}

	// explode: false puts the parameter in one value. An array joins its items,
	// an object joins alternating member name and member value. A parameter left
	// with zero usable parts is skipped
	function appendJoined(name: string, input: unknown, delimiter: string) {
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
	}

	// deepObject brackets each member under the parent name, giving ?at[gt]=1 as
	// in the §4.12.6 row. §4.12.3 covers objects with scalar properties and says
	// "the representation of array or object properties is not defined", so
	// anything below one level here extends the spec. Indices appear only where
	// repeated keys lose the shape, since a[b]=1&a[b]=2 reads back as one object
	// with a list at b
	function appendDeep(name: string, input: unknown, nestedInArray: boolean) {
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
	}

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
	// WARN: this must be kept compatible with the Command Input and Output types
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

	// Schema presence on the Command is the sole validation trigger — consumers
	// opt in by importing from the codegen's validated commands file (or via a
	// bundler alias in dev). Lean imports skip schema attachment, valibot never
	// loads, no bundle cost
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
		const { method, pathname, query, queryStyles } = command;

		const defaultUrl = new URL(`.${pathname}`, this.#base);
		appendSearchParams(defaultUrl.searchParams, query, queryStyles);

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
				async ([key, valueOrResolver]): Promise<[string, string]> => {
					if (valueOrResolver instanceof Function) {
						const resolver = valueOrResolver.bind(this);
						return [key, await resolver()];
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
