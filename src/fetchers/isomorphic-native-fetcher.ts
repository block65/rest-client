import pRetry from "p-retry";
import type * as PRetry from "p-retry";
import type { Jsonifiable } from "type-fest";
import type {
	FetcherMethod,
	FetcherParams,
	FetcherResponse,
} from "../../lib/types.ts";

// an object spread keeps only the plain-object form of RequestInit.headers
function mergedHeaders(
	defaults: RequestInit["headers"],
	overrides: Record<string, string> | undefined,
) {
	const merged = new Headers(defaults);

	for (const [name, value] of Object.entries(overrides ?? {})) {
		merged.set(name, value);
	}

	return merged;
}

function multiSignal(...signals: (AbortSignal | undefined)[]) {
	const controller = new AbortController();

	for (const signal of signals) {
		if (signal) {
			if (signal.aborted) {
				controller.abort(signal.reason);
				return signal;
			}

			signal.addEventListener("abort", () => controller.abort(signal.reason), {
				signal: controller.signal,
			});
		}
	}

	return controller.signal;
}

type IsomorphicFetcherResponse =
	| FetcherResponse<Jsonifiable>
	| FetcherResponse<ReadableStream<Uint8Array> | null>;

// transient statuses worth another attempt, below the 5xx range
const retryableStatuses = new Set([408, 425, 429]);

// holds the parsed response, so exhausted retries resolve with it
class RetryableStatusError extends Error {
	public readonly res: IsomorphicFetcherResponse;

	constructor(res: IsomorphicFetcherResponse) {
		super(res.res.statusText || `http-${res.res.status}`);
		this.res = res;
	}
}

async function intoFetcherResponse(res: Response, url: URL) {
	const contentType = res.headers.get("content-type");

	// auto parse JSON
	if (contentType?.includes("/json")) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a parsed JSON body is Jsonifiable
		const responseJson = (await res.json()) as Jsonifiable;
		return {
			body: responseJson,
			url: res.url ? new URL(res.url) : url,
			res,
		} satisfies FetcherResponse<Jsonifiable>;
	}

	return {
		body: res.body,
		url: res.url ? new URL(res.url) : url,
		res,
	} satisfies FetcherResponse<ReadableStream<Uint8Array> | null>;
}

function timeoutSignal(timeout: number | undefined) {
	if (timeout === undefined) {
		return;
	}

	return AbortSignal.timeout(timeout);
}

export function createIsomorphicNativeFetcher(
	options: Omit<RequestInit, "method" | "body" | "signal"> & {
		fetch?: typeof globalThis.fetch;
		timeout?: number;
		retry?: PRetry.Options;
	} = {},
): FetcherMethod {
	return async (params: FetcherParams) => {
		const { url, method, body, headers, credentials, signal } = params;
		const { fetch = globalThis.fetch, ...rest } = options;

		const combinedSignal = multiSignal(
			signal,
			rest.retry?.signal,
			timeoutSignal(rest.timeout),
		);

		return pRetry(
			async (_attempt: number) => {
				// fetch reads a copy, so a later write to the caller's Uint8Array
				// leaves the request as it was
				const finalBody =
					body instanceof Uint8Array ? new Uint8Array(body).buffer : body;

				const res = await fetch(url, {
					// overridable
					...(credentials && { credentials }),
					...rest,

					// combined
					headers: mergedHeaders(rest.headers, headers),
					signal: combinedSignal,

					// not overridable
					method,

					// exactOptionalPropertyTypes rejects an explicit undefined
					...(finalBody === undefined ? {} : { body: finalBody }),
				});

				const res2 = await intoFetcherResponse(res, url);

				// transient failures throw a plain error so p-retry re-attempts them
				if (
					!res.ok &&
					(res.status >= 500 || retryableStatuses.has(res.status))
				) {
					throw new RetryableStatusError(res2);
				}

				return res2;
			},
			method === "get"
				? {
						retries: 3, // default
						onFailedAttempt() {
							combinedSignal.throwIfAborted();
						},
						...rest.retry,
						signal: combinedSignal,
					}
				: {
						...rest.retry,
						retries: 0,
						signal: combinedSignal,
					},
		).catch((error: unknown) => {
			// retries exhausted — resolve with the final response so non-ok
			// handling stays the caller's job, with or without retry config
			if (error instanceof RetryableStatusError) {
				return error.res;
			}
			throw error;
		});
	};
}
