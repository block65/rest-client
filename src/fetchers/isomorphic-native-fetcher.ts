import pRetry from "p-retry";
import type * as PRetry from "p-retry";
import type { Jsonifiable } from "type-fest";
import type {
	FetcherMethod,
	FetcherParams,
	FetcherResponse,
} from "../../lib/types.ts";

// `RequestInit.headers` accepts a Headers, an array of pairs or a plain
// object, and only the last of those survives an object spread. Normalising
// through Headers keeps all three, and `set` overrides a default whatever case
// either side spells the name in
function mergedHeaders(
	defaults: RequestInit["headers"],
	overrides: Record<string, string> | undefined,
): Headers {
	const merged = new Headers(defaults);

	for (const [name, value] of Object.entries(overrides ?? {})) {
		merged.set(name, value);
	}

	return merged;
}

function multiSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
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

// transient statuses worth another attempt; everything else — ok or not —
// returns to the caller so error semantics never depend on retry config
const retryableStatuses = new Set([408, 425, 429]);

function isRetryableStatus(status: number): boolean {
	return status >= 500 || retryableStatuses.has(status);
}

// carries the parsed response through p-retry so exhausted retries can still
// resolve with the final response instead of a context-free error
class RetryableStatusError extends Error {
	public readonly res: IsomorphicFetcherResponse;

	constructor(res: IsomorphicFetcherResponse) {
		super(res.res.statusText || `http-${res.res.status}`);
		this.res = res;
	}
}

async function intoFetcherResponse(
	res: Response,
	url: URL,
): Promise<IsomorphicFetcherResponse> {
	const contentType = res.headers.get("content-type");

	// const contentLength = res.headers.get('content-length');

	// auto parse JSON
	if (contentType?.includes("/json")) {
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

export function createIsomorphicNativeFetcher(
	options: Omit<RequestInit, "method" | "body" | "signal"> & {
		fetch?: typeof globalThis.fetch;
		timeout?: number;
		retry?: PRetry.Options;
	} = {},
): FetcherMethod {
	return async (params: FetcherParams) => {
		const { url, method, body = null, headers, credentials, signal } = params;
		const { fetch = globalThis.fetch, ...rest } = options;

		const combinedSignal = multiSignal(
			signal,
			rest.retry?.signal,
			rest.timeout !== undefined
				? AbortSignal.timeout(rest.timeout)
				: undefined,
		);

		return pRetry(
			async (_attempt: number) => {
				const finalBody =
					body instanceof Uint8Array ? body.slice().buffer : body;

				const res = await fetch(url, {
					// overridable
					...(credentials && { credentials }),
					...rest,

					// combined
					headers: mergedHeaders(rest.headers, headers),
					signal: combinedSignal,

					// not overridable
					method,
					body: finalBody,
				});

				const res2 = await intoFetcherResponse(res, url);

				// transient failures throw a plain error so p-retry re-attempts them
				if (!res.ok && isRetryableStatus(res.status)) {
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
		).catch((err: unknown) => {
			// retries exhausted — resolve with the final response so non-ok
			// handling stays the caller's job, with or without retry config
			if (err instanceof RetryableStatusError) {
				return err.res;
			}
			throw err;
		});
	};
}
