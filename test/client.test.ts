import { createServer } from "node:http";
import getPort from "get-port";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import {
	Command,
	type QueryStyles,
	RestServiceClient,
	ServiceError,
	createIsomorphicNativeFetcher,
} from "../src/main.ts";
import { requestListener } from "./server.ts";

const port = await getPort();
const server = createServer(requestListener);

// fast retry backoff so the 5xx tests exercise real retries without real delays
const fetcher = createIsomorphicNativeFetcher({
	retry: { minTimeout: 1, maxTimeout: 5 },
});

type Fake200CommandInput = {
	hello: boolean;
};
class Fake200Command extends Command<Fake200CommandInput> {
	public override method = "get" as const;

	constructor(_body: Fake200CommandInput) {
		super("/200");
	}
}

type Fake404CommandInput = never;
type Fake404CommandOutput = never;

// 404
class Fake404Command extends Command<
	Fake404CommandInput,
	Fake404CommandOutput
> {
	public override method = "get" as const;

	constructor() {
		super("/404");
	}
}

// 500
class Fake500Command extends Command {
	public override method = "get" as const;

	constructor() {
		super("/500");
	}
}

// json-error
class FakeJsonErrorCommand extends Command {
	public override method = "get" as const;

	constructor() {
		super("/json-error");
	}
}

type FakeMyHeadersOutput = Record<string, string>;

// Fake500Command/FakeJsonErrorCommand extend Command with a default `unknown`
// input, so the test client has to accept that too
type Inputs = unknown;

// fake headers
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

// collides with the test client's own x-build-id header
class FakeOverrideCommand extends Command<never, FakeMyHeadersOutput> {
	public override method = "get" as const;

	constructor() {
		super("/my-headers", null, undefined, { "x-build-id": "from-command" });
	}
}

function expected(entries: [string, string][]): string {
	return new URLSearchParams(entries).toString();
}

describe("Client", () => {
	const client = new RestServiceClient<Inputs>(
		new URL(`http://0.0.0.0:${port}`),
		{
			fetcher,
			headers: {
				"x-build-id": "test/123",
				"x-async": () => Promise.resolve("Bearer 1234567890"),
				"x-func": () => "hello",
			},
		},
	);

	beforeAll(() => {
		server.listen(port);
	});

	test("200 OK!", async () => {
		const res = await client.json(
			new Fake200Command({
				hello: true,
			}),
		);

		expect(res).toMatchSnapshot();
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

	// The snapshot carries no sec-fetch-* headers: undici only appends fetch
	// metadata for a potentially trustworthy URL, and the test server is on
	// http://0.0.0.0, which is neither localhost nor in 127.0.0.0/8. They
	// reappear if this ever moves to 127.0.0.1
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
		const err = await client
			.json(new FakeJsonErrorCommand())
			.catch((e: unknown) => e);

		assert(err instanceof ServiceError);
		expect(err.response).toBeInstanceOf(Response);
		expect(err.response.status).toBe(400);
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

			let received: URL | undefined;
			const res = await client.json<never, EchoOutput>(command, {
				url: (u) => {
					received = u;
					const next = new URL(`http://0.0.0.0:${port}/echo`);
					next.searchParams.set("signed", "xyz");

					return next;
				},
			});

			assert(received);
			expect(received.pathname).toBe("/200");
			expect(received.searchParams.get("foo")).toBe("bar");
			expect(res.pathname).toBe("/echo");
			expect(res.query).toStrictEqual({ signed: "xyz" });
		});

		test("function may be async and return a string", async () => {
			const command = new EchoCommand();

			const res = await client.json<never, EchoOutput>(command, {
				url: async () => {
					await Promise.resolve();
					return `http://0.0.0.0:${port}/echo?from=string`;
				},
			});

			expect(res.query).toStrictEqual({ from: "string" });
		});
	});

	describe("query string building", () => {
		type Query = UndefinedOnPartialDeep<{ [k in string]?: JsonValue }>;

		async function captureUrl(
			query: Query,
			styles?: QueryStyles,
		): Promise<URL> {
			class QueryCommand extends Command<never, unknown, Query> {
				public override method = "get" as const;
				public override queryStyles = styles;
				constructor(q: Query) {
					super("/200", null, q);
				}
			}

			let received: URL | undefined;
			await client.json(new QueryCommand(query), {
				url: (u) => {
					received = u;
					return new URL(`http://0.0.0.0:${port}/200`);
				},
			});
			assert(received);

			return received;
		}

		test("array values become repeated keys (OpenAPI form/explode default)", async () => {
			const url = await captureUrl({ tags: ["cat", "dog"] });
			expect(url.search).toBe(
				`?${expected([
					["tags", "cat"],
					["tags", "dog"],
				])}`,
			);
		});

		test("null values are omitted entirely", async () => {
			const url = await captureUrl({ a: null, c: "keep" });
			expect(url.search).toBe(`?${expected([["c", "keep"]])}`);
		});

		test("null inside arrays is skipped per-item", async () => {
			const url = await captureUrl({ tags: ["cat", null, "dog"] });
			expect(url.search).toBe(
				`?${expected([
					["tags", "cat"],
					["tags", "dog"],
				])}`,
			);
		});

		test("undefined values are omitted entirely (not stringified as 'undefined')", async () => {
			const url = await captureUrl({ a: undefined, c: "keep" });
			expect(url.search).toBe(`?${expected([["c", "keep"]])}`);
		});

		test("scalar values stringify as before", async () => {
			const url = await captureUrl({ id: 42, flag: true, name: "alice" });
			expect(url.search).toBe(
				`?${expected([
					["id", "42"],
					["flag", "true"],
					["name", "alice"],
				])}`,
			);
		});

		// The document says how a query parameter is encoded. Nothing in the
		// corpus we generate from declares `deepObject`, so the default below is
		// what almost every generated command gets, and the styled cases are
		// driven by the `queryStyles` a command carries
		describe("form, explode: true (the OAS default)", () => {
			// OpenAI's ListAuditLogs effective_at declares no style, so this is
			// formally what it asks for. Without the hoisting the object reaches
			// toString() and goes out as "[object Object]"
			test("object members are hoisted and the parent name is dropped", async () => {
				const url = await captureUrl({
					effective_at: { gt: 1700000000, lte: 1700000100 },
					limit: 20,
					project_ids: ["proj_a", "proj_b"],
				});

				expect(url.search).toBe(
					`?${expected([
						["gt", "1700000000"],
						["lte", "1700000100"],
						["limit", "20"],
						["project_ids", "proj_a"],
						["project_ids", "proj_b"],
					])}`,
				);
				expect(url.search).not.toContain("object+Object");
			});

			// the lossiness the style carries: the spec has no way to express this
			// pair, which is why the generator warns when a document leaves an
			// object-valued parameter's style unstated
			test("two object params sharing a member name collide, by construction", async () => {
				const url = await captureUrl({ a: { gt: 1 }, b: { gt: 2 } });
				expect(url.search).toBe(
					`?${expected([
						["gt", "1"],
						["gt", "2"],
					])}`,
				);
			});

			test("a nested object is hoisted again", async () => {
				const url = await captureUrl({ a: { b: { c: 1 } } });
				expect(url.search).toBe(`?${expected([["c", "1"]])}`);
			});

			test("an array inside an object repeats under the member name", async () => {
				const url = await captureUrl({ range: { ids: ["a", "b"] } });
				expect(url.search).toBe(
					`?${expected([
						["ids", "a"],
						["ids", "b"],
					])}`,
				);
			});

			test("null and undefined members are omitted", async () => {
				// exactOptionalPropertyTypes makes an explicitly-undefined member
				// inexpressible here, but stripUndefined only clears the top level, so
				// one really does reach serialization at runtime
				const url = await captureUrl({
					range: { gt: 1, skipNull: null, skipUndefined: undefined },
				} as never);
				expect(url.search).toBe(`?${expected([["gt", "1"]])}`);
			});

			test("an object with no usable members contributes nothing", async () => {
				const url = await captureUrl({ range: {}, keep: "yes" });
				expect(url.search).toBe(`?${expected([["keep", "yes"]])}`);
			});
		});

		describe("form, explode: false", () => {
			const joined: QueryStyles = {
				changes: { style: "form", explode: false },
			};

			// Docker's /images/create declares exactly this
			test("an array joins its items with commas under one key", async () => {
				const url = await captureUrl(
					{ changes: ["ENV A=1", "ENV B=2"] },
					joined,
				);
				expect(url.search).toBe(
					`?${expected([["changes", "ENV A=1,ENV B=2"]])}`,
				);
			});

			test("an object joins as alternating member name and value", async () => {
				const url = await captureUrl({ changes: { gt: 1, lte: 2 } }, joined);
				expect(url.search).toBe(`?${expected([["changes", "gt,1,lte,2"]])}`);
			});

			test("a scalar is unaffected", async () => {
				const url = await captureUrl({ changes: "one" }, joined);
				expect(url.search).toBe(`?${expected([["changes", "one"]])}`);
			});

			test("nothing usable contributes no key at all", async () => {
				const url = await captureUrl({ changes: [], keep: "yes" }, joined);
				expect(url.search).toBe(`?${expected([["keep", "yes"]])}`);
			});

			test("spaceDelimited and pipeDelimited change only the delimiter", async () => {
				const spaced = await captureUrl(
					{ a: [1, 2] },
					{
						a: { style: "spaceDelimited", explode: false },
					},
				);
				expect(spaced.search).toBe(`?${expected([["a", "1 2"]])}`);

				const piped = await captureUrl(
					{ a: [1, 2] },
					{
						a: { style: "pipeDelimited", explode: false },
					},
				);
				expect(piped.search).toBe(`?${expected([["a", "1|2"]])}`);
			});
		});

		describe("deepObject", () => {
			const deep: QueryStyles = {
				effective_at: { style: "deepObject", explode: true },
				a: { style: "deepObject", explode: true },
			};

			test("object members are bracketed under the parent name", async () => {
				const url = await captureUrl(
					{ effective_at: { gt: 1700000000, lte: 1700000100 } },
					deep,
				);
				expect(url.search).toBe(
					`?${expected([
						["effective_at[gt]", "1700000000"],
						["effective_at[lte]", "1700000100"],
					])}`,
				);
			});

			test("objects nested deeper than one level keep nesting brackets", async () => {
				const url = await captureUrl({ a: { b: { c: 1 } } }, deep);
				expect(url.search).toBe(`?${expected([["a[b][c]", "1"]])}`);
			});

			test("an array inside an object repeats at the member path", async () => {
				const url = await captureUrl({ a: { ids: ["x", "y"] } }, deep);
				expect(url.search).toBe(
					`?${expected([
						["a[ids]", "x"],
						["a[ids]", "y"],
					])}`,
				);
			});

			// repeated keys cannot express this - a[b]=1&a[b]=2 reads back as a single
			// object whose b is a list - so the array takes indices here and only here
			test("objects inside an array are indexed", async () => {
				const url = await captureUrl({ a: [{ b: 1 }, { b: 2 }] }, deep);
				expect(url.search).toBe(
					`?${expected([
						["a[0][b]", "1"],
						["a[1][b]", "2"],
					])}`,
				);
			});

			// the second inner array is the load-bearing one: indexing only the outer
			// level would send a[1]=3, which reads back as the scalar "3" rather
			// than ["3"]
			test("nested arrays are indexed rather than comma-joined", async () => {
				const url = await captureUrl({ a: [[1, 2], [3]] }, deep);
				expect(url.search).toBe(
					`?${expected([
						["a[0][0]", "1"],
						["a[0][1]", "2"],
						["a[1][0]", "3"],
					])}`,
				);
			});

			test("two object params sharing a member name no longer collide", async () => {
				const url = await captureUrl(
					{ a: { gt: 1 }, effective_at: { gt: 2 } },
					deep,
				);
				expect(url.search).toBe(
					`?${expected([
						["a[gt]", "1"],
						["effective_at[gt]", "2"],
					])}`,
				);
			});
		});

		// A Date gets no special case: it is just the best-known implementor of
		// toJSON. Walking it as a bag of members would give nothing at all (it has
		// no enumerable own properties), and its toString is a timezone-dependent
		// locale string ("Thu Jan 01 1970 08:00:00 GMT+0800 (...)")
		test("a Date serializes via toJSON as ISO, not a locale string", async () => {
			// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop is the subject
			const when = new Date(0);
			const url = await captureUrl({ when } as never);

			expect(url.searchParams.get("when")).toBe("1970-01-01T00:00:00.000Z");
			expect([...url.searchParams.keys()]).toStrictEqual(["when"]);
		});

		// the reason toJSON is preferred over a Date special case: toISOString
		// throws RangeError here, and a serializer that cannot throw should stay
		// that way. toJSON answers null, which the null rule already omits
		test("an invalid Date is omitted rather than throwing", async () => {
			const url = await captureUrl({
				// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Temporal throws on construction, so it cannot express this
				when: new Date(Number.NaN),
				keep: "yes",
			} as never);

			expect(url.search).toBe(`?${expected([["keep", "yes"]])}`);
		});

		test("any class implementing toJSON supplies its own value", async () => {
			class Money {
				public toJSON() {
					return "5 USD";
				}
			}

			const url = await captureUrl({ price: new Money() } as never);
			expect(url.searchParams.get("price")).toBe("5 USD");
		});

		// toJSON may legally return anything, so its result goes back through the
		// normal rules rather than being stringified
		test("a toJSON returning an object follows the object rules", async () => {
			class Range {
				public toJSON() {
					return { gt: 1, lte: 2 };
				}
			}

			const url = await captureUrl({ at: new Range() } as never);
			expect(url.search).toBe(
				`?${expected([
					["gt", "1"],
					["lte", "2"],
				])}`,
			);
		});

		test("a toJSON returning an array follows the array rules", async () => {
			class Tags {
				public toJSON() {
					return ["cat", "dog"];
				}
			}

			const url = await captureUrl({ tags: new Tags() } as never);
			expect(url.search).toBe(
				`?${expected([
					["tags", "cat"],
					["tags", "dog"],
				])}`,
			);
		});

		// toJSON is an opt-in for values that are opaque to the encoder. A plain
		// object is not opaque, and `toJSON` is a legal member name in a query
		// object, so the object rules win there
		test("a plain object is still walked even if it carries a toJSON member", async () => {
			const url = await captureUrl({
				a: { gt: 1, toJSON: "not a hook" },
			});

			expect(url.search).toBe(
				`?${expected([
					["gt", "1"],
					["toJSON", "not a hook"],
				])}`,
			);
		});

		test("non-plain objects with no toJSON are left to their own toString", async () => {
			class Point {
				public toString() {
					return "1,2";
				}
			}

			const url = await captureUrl({ p: new Point() } as never);
			expect(url.searchParams.get("p")).toBe("1,2");
		});

		// a built-in whose toJSON and toString agree - unchanged by the switch
		test("a URL still serializes as its href", async () => {
			const url = await captureUrl({
				u: new URL("https://example.test/x"),
			} as never);
			expect(url.searchParams.get("u")).toBe("https://example.test/x");
		});

		// scalars and scalar arrays are what almost every generated query is made
		// of, and the default style leaves them exactly where they were, so this
		// asserts the exact bytes rather than the shape
		test("scalars and scalar arrays are byte-identical to the old encoding", async () => {
			const url = await captureUrl({
				id: 42,
				flag: true,
				name: "alice",
				tags: ["cat", "dog"],
			});

			expect(url.search).toBe("?id=42&flag=true&name=alice&tags=cat&tags=dog");
			expect(url.search).not.toContain("%5B");
		});
	});

	// 0f03f56 guarded the whole merge on this.#headers, so a client configured
	// without headers sent none at all — not even json()'s own content-type
	describe("client configured without headers", () => {
		const bareClient = new RestServiceClient<Inputs>(
			new URL(`http://0.0.0.0:${port}`),
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
