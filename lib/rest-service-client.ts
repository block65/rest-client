import { isStatusCode } from '@block65/custom-error';
import type { SerializedError, StatusCode } from '@block65/custom-error';
import type { Jsonifiable } from 'type-fest';
import { createIsomorphicNativeFetcher } from '../src/fetchers/isomorphic-native-fetcher.ts';
import type { Command } from './command.ts';
import { resolveHeaders } from './common.ts';
import { ServiceError, ServiceResponseError } from './errors.ts';
import type {
	FetcherMethod,
	JsonifiableObject,
	ResolvableHeaders,
	RuntimeOptions,
} from './types.ts';
import { isPlainObject } from './utils.ts';

export type RestServiceClientConfig = {
	logger?: ((msg: string, ...args: unknown[]) => void) | undefined;
	headers?: ResolvableHeaders | undefined;
	credentials?: 'include' | 'omit' | 'same-origin' | undefined;
} & ({ fetcher?: FetcherMethod } | { fetch?: typeof globalThis.fetch });

export class RestServiceClient<
	// WARN: this must be kept compatible with the Command Input and Output types
	ClientInput extends JsonifiableObject | unknown = unknown,
	ClientOutput extends Jsonifiable | unknown = unknown,
> {
	readonly #base: URL;

	readonly #fetcher: FetcherMethod;

	readonly #headers: ResolvableHeaders | undefined;

	#logger: RestServiceClientConfig['logger'];

	constructor(base: URL | string, config: RestServiceClientConfig = {}) {
		this.#base = new URL(base);
		this.#headers = Object.freeze(config.headers);

		this.#logger = config.logger;

		this.#fetcher =
			'fetcher' in config
				? config.fetcher
				: createIsomorphicNativeFetcher(
					'fetch' in config
						? {
							fetch: config.fetch,
						}
						: {},
				);
	}

	#log(msg: string, ...args: unknown[]) {
		this.#logger?.(`[rest-client] ${msg}`, ...args);
	}

	public async response<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(command: Command<InputType, OutputType>, runtimeOptions?: RuntimeOptions) {
		const { method, pathname, query } = command;

		const url = new URL(`.${pathname}`, this.#base);
		url.search = query
			? new URLSearchParams(
				Object.entries(query).map(([k, v]) => [k, v?.toString() || '']),
			).toString()
			: '';

		this.#log('req: %s %s', method.toUpperCase(), url, runtimeOptions);

		const result = await this.#fetcher({
			url,
			method,

			...(command.body && {
				body: command.body,
			}),

			headers: await resolveHeaders({
				...this.#headers,
				...runtimeOptions?.headers,
			}),
			...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
		});


		this.#log(
			'res: %d %s %s %s',
			result.res.status,
			result.res.statusText,
			result.res.headers.get('content-type') || '-',
			result.res.headers.get('content-length') || '-',
		);

		return result;
	}

	public async json<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<OutputType> {
		const { res, body } = await this.response(command, {
			...runtimeOptions,
			headers: {
				...runtimeOptions?.headers,
				'content-type': 'application/json;charset=utf-8',
			},
		});

		if (res.status < 400) {
			return body as OutputType;
		}

		if (isPlainObject(body) && 'code' in body) {
			throw ServiceError.fromJSON(
				body as unknown as SerializedError<StatusCode>,
			).addDetail({
				reason: `http-${res.status}`,
				metadata: {
					status: res.status.toString(),
					statusText: res.statusText,
				},
			});
		}
		throw new ServiceError(res.statusText, res).debug({ res });
	}

	public async send<
		InputType extends ClientInput,
		OutputType extends ClientOutput,
	>(
		command: Command<InputType, OutputType>,
		runtimeOptions?: RuntimeOptions,
	): Promise<OutputType> {
		const { res, body } = await this.response(command, runtimeOptions);

		if (res.status < 400) {
			return body as OutputType;
		}

		if (res.headers.get('content-type')?.includes('application/json')) {
			if (isPlainObject(body) && 'message' in body) {
				throw ServiceError.fromJSON(
					{
						code:
						'code' in body && isStatusCode(body.code)
							? body.code
							: ServiceError.UNKNOWN,
						message: String(body.message),
						name: 'ServiceError',
						details: [
							{
								reason: `http-${res.status}`,
								metadata: {
									status: res.status.toString(),
									statusText: res.statusText,
								},
							}
						]
					}
				);
			}
			throw new ServiceResponseError(res);
		}

		throw new ServiceResponseError(res);
	}

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
