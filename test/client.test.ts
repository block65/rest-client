import { createServer } from "node:http";
import {
	Command,
	type FetcherMethod,
	type QuerySerializer,
	RestServiceClient,
	type RestServiceClientConfig,
	SequentialMediaCommand,
	ServiceError,
	createIsomorphicNativeFetcher,
	deepObjectSerializer,
	formExplodeSerializer,
	formJoinSerializer,
	pipeDelimitedSerializer,
	spaceDelimitedSerializer,
} from "@block65/rest-client";
import getPort from "get-port";
import type { JsonObject, UnknownRecord } from "type-fest";
import {
	afterAll,
	assert,
	beforeAll,
	describe,
	expect,
	expectTypeOf,
	test,
	vi,
} from "vitest";
import { requestListener } from "./server.ts";

const port = await getPort();
const server = createServer(requestListener);

// fast retry backoff so the 5xx tests exercise real retries without real delays
const fetcher = createIsomorphicNativeFetcher({
	retry: { minTimeout: 1, maxTimeout: 5 },
});

class Fake200Command extends Command {
	public override method = "get" as const;

	constructor() {
		super("/200");
	}
}

type Fake404CommandInput = never;
type Fake404CommandOutput = never;

class Fake404Command extends Command<
	Fake404CommandInput,
	Fake404CommandOutput
> {
	public override method = "get" as const;

	constructor() {
		super("/404");
	}
}

class Fake500Command extends Command {
	public override method = "get" as const;

	constructor() {
		super("/500");
	}
}

class FakeJsonErrorCommand extends Command {
	public override method = "get" as const;

	constructor() {
		super("/json-error");
	}
}

class Fake204Command extends Command {
	public override method = "get" as const;

	constructor() {
		super("/204");
	}
}

class FakeVendorJsonCommand extends Command {
	public override method = "get" as const;

	constructor() {
		super("/vendor-json");
	}
}

class FakeJsonSeqCommand extends Command {
	public override method = "get" as const;

	constructor() {
		super("/json-seq");
	}
}

class FakeEventStreamCommand extends Command {
	public override method = "get" as const;

	constructor() {
		super("/event-stream");
	}
}

type FakeMyHeadersOutput = Record<string, string>;

class FakeMyHeadersCommand extends Command<never, FakeMyHeadersOutput> {
	public override method = "get" as const;

	constructor() {
		super("/my-headers");
	}
}

class FakeCommandHeadersCommand extends Command<never, FakeMyHeadersOutput> {
	public override method = "get" as const;

	constructor() {
		super("/my-headers", null, undefined, { "x-from-command": "command" });
	}
}

// sets the same header name the test client sets
class FakeOverrideCommand extends Command<never, FakeMyHeadersOutput> {
	public override method = "get" as const;

	constructor() {
		super("/my-headers", null, undefined, { "x-build-id": "from-command" });
	}
}

// a command names its serializer, this one takes it so a test can pick
class QueryCommand extends Command {
	public override method = "get" as const;

	public override readonly querySerializer: QuerySerializer;

	constructor(query: UnknownRecord, serializer = formExplodeSerializer) {
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test data
		super("/query", null, query as JsonObject);
		this.querySerializer = serializer;
	}
}

async function serializeViaClient(
	query: UnknownRecord,
	options: {
		serializer?: QuerySerializer;
		sortQuery?: RestServiceClientConfig["sortQuery"];
	} = {},
) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
	const client = new RestServiceClient("https://192.0.2.1", {
		fetch,
		sortQuery: options.sortQuery,
	});

	await client.json(new QueryCommand(query, options.serializer));

	expect(fetch).toHaveBeenCalledOnce();
	const [url] = fetch.mock.calls[0] ?? [];
	assert(url instanceof URL);

	return url;
}

describe("Client", () => {
	const client = new RestServiceClient(new URL(`http://127.0.0.1:${port}`), {
		fetcher,
		headers: {
			"x-build-id": "test/123",
			"x-async": () => Promise.resolve("Bearer 1234567890"),
			"x-func": () => "hello",
		},
	});

	beforeAll(() => {
		server.listen(port);
	});

	test("200 OK!", async () => {
		const res = await client.json(new Fake200Command());

		expect(res).toMatchSnapshot();
	});

	test("a +json vendor type is parsed as JSON", async () => {
		await expect(client.send(new FakeVendorJsonCommand())).resolves.toEqual({
			login: "octocat",
		});
	});

	test("a JSON text sequence is left as a stream", async () => {
		await expect(client.send(new FakeJsonSeqCommand())).resolves.toBeInstanceOf(
			ReadableStream,
		);
	});

	test("404", async () => {
		await expect(client.json(new Fake404Command())).rejects.toMatchSnapshot();
	});

	test("500", async () => {
		await expect(client.json(new Fake500Command())).rejects.toMatchSnapshot();
	});

	test("JSON Error", async () => {
		await expect(
			client.json(new FakeJsonErrorCommand()),
		).rejects.toThrowErrorMatchingSnapshot('"Data should be array"');
	});

	test("Headers", async () => {
		const command = new FakeMyHeadersCommand();
		const res = await client.json(command, {
			headers: {
				"x-merged": "hello",
			},
		});

		expect(res).toMatchSnapshot();
	});

	test("runtime accept header overrides json() default", async () => {
		const command = new FakeMyHeadersCommand();
		const res = await client.json(command, {
			headers: {
				accept: "application/vnd.custom+json",
			},
		});

		assert(res && typeof res === "object" && "accept" in res);
		expect(res.accept).toBe("application/vnd.custom+json");
	});

	test("JSON error attaches response to thrown ServiceError", async () => {
		const rejection = await client
			.json(new FakeJsonErrorCommand())
			.catch((err: unknown) => err);

		assert(rejection instanceof ServiceError);
		expect(rejection.response).toBeInstanceOf(Response);
		expect(rejection.response.status).toBe(400);
	});

	describe("stream()", () => {
		test("hands back the body of a success as a stream", async () => {
			const stream = await client.stream(new FakeEventStreamCommand());

			const text = await new Response(stream).text();

			expect(text).toBe("event: ping\ndata: {}\n\n");
		});

		test("hands back a JSON success unparsed", async () => {
			const stream = await client.stream(new Fake200Command());

			await expect(new Response(stream).text()).resolves.toBe("[1,2,3]");
		});

		test("types a plain command's stream as bytes", async () => {
			const stream = await client.stream(new FakeEventStreamCommand());

			expectTypeOf(stream).toEqualTypeOf<
				ReadableStream<Uint8Array<ArrayBuffer>>
			>();

			await stream.cancel();
		});

		test("yields the items a sequential media command parses", async () => {
			class FakeTextCommand extends SequentialMediaCommand<never, string> {
				public override method = "get" as const;

				public readonly mediaType = "text/event-stream";

				constructor() {
					super("/event-stream");
				}

				public parse(body: ReadableStream<Uint8Array<ArrayBuffer>>) {
					return body.pipeThrough(new TextDecoderStream());
				}
			}

			const stream = await client.stream(new FakeTextCommand());

			expectTypeOf(stream).toEqualTypeOf<ReadableStream<string>>();
			await expect(
				Array.fromAsync(stream).then((texts) => texts.join("")),
			).resolves.toBe("event: ping\ndata: {}\n\n");
		});

		test("hands back an empty body as an empty stream", async () => {
			const stream = await client.stream(new Fake204Command());

			await expect(new Response(stream).text()).resolves.toBe("");
		});

		test("rejects a body a custom fetcher parsed anyway", async () => {
			const parsingClient = new RestServiceClient(new URL("http://127.0.0.1"), {
				fetcher: vi.fn<FetcherMethod>(async ({ url }) => ({
					url,
					res: new Response(null, { status: 200 }),
					body: [1, 2, 3],
				})),
			});

			await expect(parsingClient.stream(new Fake200Command())).rejects.toThrow(
				TypeError,
			);
		});

		test("rejects a JSON refusal as a ServiceError carrying its response", async () => {
			const rejection = await client
				.stream(new FakeJsonErrorCommand())
				.catch((err: unknown) => err);

			assert(rejection instanceof ServiceError);
			expect(rejection.message).toBe("Data should be array");
			expect(rejection.response.status).toBe(400);
		});

		test("rejects a refusal with a non-JSON body by its status", async () => {
			const rejection = await client
				.stream(new Fake404Command())
				.catch((err: unknown) => err);

			assert(rejection instanceof ServiceError);
			expect(rejection.response.status).toBe(404);
		});

		test("logs a refusal body that fails to cancel, and still rejects with the refusal", async () => {
			const bodyError = new Error("socket hang up");
			const logger = vi.fn<(msg: string, ...args: unknown[]) => void>();
			const erroringClient = new RestServiceClient(
				new URL("http://127.0.0.1"),
				{
					logger,
					fetcher: vi.fn<FetcherMethod>(async ({ url }) => ({
						url,
						res: new Response(null, { status: 401 }),
						body: new ReadableStream({
							start(controller) {
								controller.error(bodyError);
							},
						}),
					})),
				},
			);

			const rejection = await erroringClient
				.stream(new Fake404Command())
				.catch((err: unknown) => err);

			assert(rejection instanceof ServiceError);
			expect(rejection.response.status).toBe(401);
			expect(logger).toHaveBeenCalledWith(
				"[rest-client] refusal body cancel failed",
				bodyError,
			);
		});
	});

	describe("runtimeOptions.url", () => {
		type EchoOutput = {
			method: string;
			pathname: string;
			search: string;
			query: Record<string, string>;
		};

		class EchoCommand extends Command<never, EchoOutput, { foo?: string }> {
			public override method = "get" as const;

			constructor(query?: { foo?: string }) {
				super("/200", null, query);
			}
		}

		test("function receives default-built URL; return value is fetched as-is (presigned-style takeover)", async () => {
			const command = new EchoCommand({ foo: "bar" });

			const rewriteUrl = vi.fn<(built: URL) => URL>(() => {
				const signed = new URL(`http://127.0.0.1:${port}/echo`);
				signed.searchParams.set("signed", "xyz");

				return signed;
			});
			const res = await client.json<never, EchoOutput>(command, {
				url: rewriteUrl,
			});

			expect(rewriteUrl).toHaveBeenCalledOnce();
			const [built] = rewriteUrl.mock.calls[0] ?? [];
			assert(built);
			expect(built.pathname).toBe("/200");
			expect(built.searchParams.get("foo")).toBe("bar");
			expect(res.pathname).toBe("/echo");
			expect(res.query).toStrictEqual({ signed: "xyz" });
		});

		test("function may be async and return a string", async () => {
			const command = new EchoCommand();

			const res = await client.json<never, EchoOutput>(command, {
				url: async () => {
					await Promise.resolve();
					return `http://127.0.0.1:${port}/echo?from=string`;
				},
			});

			expect(res.query).toStrictEqual({ from: "string" });
		});
	});

	// the client's own job here is calling the command's serializer. What
	// each style writes is asserted against the serializer directly
	test("a command's serializer writes the search", async () => {
		const url = await serializeViaClient(
			{ tags: ["cat", "dog"] },
			{ serializer: () => "fixed=1" },
		);

		expect(url.search).toBe("?fixed=1");
	});

	// each serializer a command can name, reaching the URL through the client
	describe.each([
		["formExplodeSerializer", formExplodeSerializer],
		["formJoinSerializer", formJoinSerializer],
		["spaceDelimitedSerializer", spaceDelimitedSerializer],
		["pipeDelimitedSerializer", pipeDelimitedSerializer],
		["deepObjectSerializer", deepObjectSerializer],
	])("a command naming %s", (_name, serializer) => {
		const query = {
			limit: 10,
			tags: ["cat", "dog"],
			filter: { since: "2020", until: "2021" },
		};

		test("writes the URL", async () => {
			const url = await serializeViaClient(query, { serializer });
			expect(url.href).toMatchSnapshot();
		});

		test("writes the URL with sortQuery", async () => {
			const url = await serializeViaClient(query, {
				serializer,
				sortQuery: true,
			});
			expect(url.href).toMatchSnapshot();
		});
	});

	test("a command without a query sends no search", async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
		const bare = new RestServiceClient("https://192.0.2.1", { fetch });

		await bare.json(new Fake200Command());

		const [url] = fetch.mock.calls[0] ?? [];
		assert(url instanceof URL);
		expect(url.search).toBe("");
	});

	describe("client configured without headers", () => {
		const bareClient = new RestServiceClient(
			new URL(`http://127.0.0.1:${port}`),
			{ fetcher },
		);

		test("json() still sends its content-type and accept defaults", async () => {
			const res = await bareClient.json(new FakeMyHeadersCommand());

			assert(res && typeof res === "object");
			expect(res).toMatchObject({
				accept: "application/json",
				"content-type": "application/json;charset=utf-8",
			});
		});

		test("command and runtime headers still reach the request", async () => {
			const res = await bareClient.json(new FakeCommandHeadersCommand(), {
				headers: { "x-runtime": "runtime" },
			});

			assert(res && typeof res === "object");
			expect(res).toMatchObject({
				"x-from-command": "command",
				"x-runtime": "runtime",
			});
		});
	});

	describe("sortQuery", () => {
		const queryParams = { z: 1, m: [2, 3], a: 4 };

		// a spy serializer shows the client's key order before a style writes it
		test("the serializer is handed a sorted copy, values intact", async () => {
			const serialize = vi.fn<QuerySerializer>(() => "");

			await serializeViaClient(queryParams, {
				sortQuery: true,
				serializer: serialize,
			});

			expect(serialize).toHaveBeenCalledOnce();
			const [handed] = serialize.mock.calls[0] ?? [];

			expect(Object.keys(handed ?? {})).toStrictEqual(["a", "m", "z"]);
			expect(handed).toStrictEqual(queryParams);
		});

		test("a comparator decides the order the serializer is handed", async () => {
			const serialize = vi.fn<QuerySerializer>(() => "");

			// written ascending so a descending comparator has to move them
			await serializeViaClient(
				{ a: 4, m: [2, 3], z: 1 },
				{ sortQuery: (a, b) => b.localeCompare(a), serializer: serialize },
			);

			const [handed] = serialize.mock.calls[0] ?? [];
			expect(Object.keys(handed ?? {})).toStrictEqual(["z", "m", "a"]);
		});

		test("unset hands the serializer the written order", async () => {
			const serialize = vi.fn<QuerySerializer>(() => "");

			await serializeViaClient(queryParams, { serializer: serialize });

			const [handed] = serialize.mock.calls[0] ?? [];
			expect(Object.keys(handed ?? {})).toStrictEqual(["z", "m", "a"]);
		});

		test("unset keeps the written order", async () => {
			const url = await serializeViaClient(queryParams);
			expect(url.search).toBe("?z=1&m=2&m=3&a=4");
		});

		test("true sorts the keys the default serializer writes", async () => {
			const url = await serializeViaClient(queryParams, { sortQuery: true });
			expect(url.search).toBe("?a=4&m=2&m=3&z=1");
		});

		test("true sorts the keys another style writes", async () => {
			const url = await serializeViaClient(queryParams, {
				sortQuery: true,
				serializer: formJoinSerializer,
			});
			expect(url.search).toBe("?a=4&m=2,3&z=1");
		});

		// UTF-16 puts the emoji's surrogates before U+FF01, code points after
		test("true orders an astral key after U+FF01", async () => {
			const url = await serializeViaClient(
				{ "\u{1F600}": 1, "\uFF01": 2 },
				{ sortQuery: true },
			);
			expect([...url.searchParams.keys()]).toEqual(["\uFF01", "\u{1F600}"]);
		});

		test("a comparator decides the order", async () => {
			// written ascending so a descending comparator has to move them
			const url = await serializeViaClient(
				{ a: 4, m: [2, 3], z: 1 },
				{ sortQuery: (a, b) => b.localeCompare(a) },
			);
			expect(url.search).toBe("?z=1&m=2&m=3&a=4");
		});
	});

	test("command headers override client headers", async () => {
		const res = await client.json(new FakeOverrideCommand());

		assert(res && typeof res === "object");
		expect(res).toMatchObject({ "x-build-id": "from-command" });
	});

	test("runtime headers override command headers", async () => {
		const res = await client.json(new FakeCommandHeadersCommand(), {
			headers: { "x-from-command": "from-runtime" },
		});

		assert(res && typeof res === "object");
		expect(res).toMatchObject({ "x-from-command": "from-runtime" });
	});
});

afterAll(() => {
	server.close();
});
