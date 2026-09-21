import { createServer } from "node:http";
import getPort from "get-port";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import {
	Command,
	type QuerySerializer,
	type QueryStyles,
	RestServiceClient,
	ServiceError,
	createIsomorphicNativeFetcher,
	createQueryStringSerializer,
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

// sets the same header name the test client sets
class FakeOverrideCommand extends Command<never, FakeMyHeadersOutput> {
	public override method = "get" as const;

	constructor() {
		super("/my-headers", null, undefined, { "x-build-id": "from-command" });
	}
}

function expected(entries: [string, string][]) {
	return new URLSearchParams(entries).toString();
}

describe("Client", () => {
	const client = new RestServiceClient(new URL(`http://0.0.0.0:${port}`), {
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

	// undici appends sec-fetch-* metadata for a potentially trustworthy URL
	// alone, and the test server runs on http://0.0.0.0. Moving it to
	// 127.0.0.1 puts those headers in the snapshot
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
			.catch((error: unknown) => error);

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

		const captureUrl = async (query: Query, styles?: QueryStyles) => {
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
		};

		const captureSerialized = async (
			query: Query,
			serializer: QuerySerializer,
		) => {
			class SerializedCommand extends Command<never, unknown, Query> {
				public override method = "get" as const;
				public override querySerializer = serializer;
				constructor(q: Query) {
					super("/200", null, q);
				}
			}

			let received: URL | undefined;
			await client.json(new SerializedCommand(query), {
				url: (u) => {
					received = u;
					return new URL(`http://0.0.0.0:${port}/200`);
				},
			});
			assert(received);

			return received;
		};

		const captureAnyUrl = (query: Record<string, unknown>) =>
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- these cases drive values Query excludes
			captureUrl(query as Query);

		const captureAnySerialized = (
			query: Record<string, unknown>,
			serializer: QuerySerializer,
		) =>
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- these cases drive values Query excludes
			captureSerialized(query as Query, serializer);

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

		// almost every generated command lands on this default, and the styled
		// cases below run from a command's own `queryStyles`
		describe("form, explode: true (the OAS default)", () => {
			// OpenAI's ListAuditLogs effective_at states this style by omission,
			// and an unhoisted object would go out as "[object Object]"
			test("object members are hoisted and the parent name is dropped", async () => {
				const url = await captureUrl({
					effective_at: { gt: 1_700_000_000, lte: 1_700_000_100 },
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

			// the style is lossy here, so the generator warns when a document
			// leaves an object-valued parameter's style unstated
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
				const url = await captureAnyUrl({
					range: { gt: 1, skipNull: null, skipUndefined: undefined },
				});
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

				// expected() builds with URLSearchParams, which writes a space as
				// + where the client writes %20
				expect(url.search).toBe("?changes=ENV%20A%3D1%2CENV%20B%3D2");
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

				// the OAS example for spaceDelimited is percent encoded, id=3%204%205
				expect(spaced.search).toBe("?a=1%202");

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
					{ effective_at: { gt: 1_700_000_000, lte: 1_700_000_100 } },
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

			// a[b]=1&a[b]=2 reads back as one object with a list at b, so an array
			// of objects takes indices instead
			test("objects inside an array are indexed", async () => {
				const url = await captureUrl({ a: [{ b: 1 }, { b: 2 }] }, deep);
				expect(url.search).toBe(
					`?${expected([
						["a[0][b]", "1"],
						["a[1][b]", "2"],
					])}`,
				);
			});

			// indexing the outer level alone would send a[1]=3, and that reads back
			// as the scalar "3" instead of ["3"]
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

		// A Date reaches the serializer as an ordinary toJSON implementor. Its
		// enumerable members are empty and toString gives a timezone dependent
		// locale string, leaving toJSON as the usable form
		test("a Date serializes via toJSON as ISO, not a locale string", async () => {
			// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop is the subject
			const when = new Date(0);
			const url = await captureAnyUrl({ when });

			expect(url.searchParams.get("when")).toBe("1970-01-01T00:00:00.000Z");
			expect([...url.searchParams.keys()]).toStrictEqual(["when"]);
		});

		// toISOString throws RangeError on an invalid Date, and this serializer
		// stays throw-free. toJSON returns null, which the null rule omits
		test("an invalid Date is omitted rather than throwing", async () => {
			const url = await captureAnyUrl({
				// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Temporal throws on construction, so it cannot express this
				when: new Date(Number.NaN),
				keep: "yes",
			});

			expect(url.search).toBe(`?${expected([["keep", "yes"]])}`);
		});

		test("any class implementing toJSON supplies its own value", async () => {
			class Money {
				public toJSON() {
					return "5 USD";
				}
			}

			const url = await captureAnyUrl({ price: new Money() });
			expect(url.searchParams.get("price")).toBe("5 USD");
		});

		// toJSON may legally return anything, so its result re-enters the normal
		// rules instead of being stringified
		test("a toJSON returning an object follows the object rules", async () => {
			class Range {
				public toJSON() {
					return { gt: 1, lte: 2 };
				}
			}

			const url = await captureAnyUrl({ at: new Range() });
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

			const url = await captureAnyUrl({ tags: new Tags() });
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

			expect(url.search).toBe("?gt=1&toJSON=not%20a%20hook");
		});

		test("non-plain objects with no toJSON are left to their own toString", async () => {
			class Point {
				public toString() {
					return "1,2";
				}
			}

			const url = await captureAnyUrl({ p: new Point() });
			expect(url.searchParams.get("p")).toBe("1,2");
		});

		// a built-in where toJSON and toString agree, unchanged by the switch
		test("a URL still serializes as its href", async () => {
			const url = await captureAnyUrl({
				u: new URL("https://example.com/x"),
			});
			expect(url.searchParams.get("u")).toBe("https://example.com/x");
		});

		// almost every generated query is scalars and scalar arrays, and the
		// default style leaves those bytes untouched, so assert the bytes
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

		describe("a command's own serializer", () => {
			test("it replaces the default", async () => {
				const url = await captureSerialized(
					{ tags: ["cat", "dog"] },
					() => "fixed=1",
				);

				expect(url.search).toBe("?fixed=1");
			});

			test("query-string writes the arrayFormat a repeated key cannot", async () => {
				const url = await captureSerialized(
					{ tags: ["cat", "dog"] },
					createQueryStringSerializer({ arrayFormat: "comma" }),
				);

				expect(url.searchParams.get("tags")).toBe("cat,dog");
			});

			// query-string sorts its keys unless told not to, which would reorder
			// every query the client already sends
			test("query-string keeps insertion order", async () => {
				const url = await captureSerialized(
					{ z: 1, a: 2 },
					createQueryStringSerializer(),
				);

				expect(url.search).toBe("?z=1&a=2");
			});

			test("query-string drops null and undefined as the default does", async () => {
				const url = await captureSerialized(
					{ a: null, b: undefined, c: "keep" },
					createQueryStringSerializer(),
				);

				expect(url.search).toBe("?c=keep");
			});

			test("query-string applies toJSON before encoding", async () => {
				const url = await captureAnySerialized(
					// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop is the subject
					{ when: new Date(0) },
					createQueryStringSerializer(),
				);

				expect(url.searchParams.get("when")).toBe("1970-01-01T00:00:00.000Z");
			});
		});
	});

	// 0f03f56 guarded the whole merge on this.#headers, so a headerless client
	// sent an empty set, dropping the content-type json() adds
	describe("client configured without headers", () => {
		const bareClient = new RestServiceClient(
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
