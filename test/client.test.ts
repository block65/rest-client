import { createServer } from "node:http";
import getPort from "get-port";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import {
	Command,
	type QuerySerializer,
	RestServiceClient,
	ServiceError,
	createIsomorphicNativeFetcher,
	deepObjectSerializer,
	formCommaSerializer,
	formSerializer,
	pipeDelimitedSerializer,
	spaceDelimitedSerializer,
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

		const captureUrl = async (query: Query, serializer?: QuerySerializer) => {
			class QueryCommand extends Command<never, unknown, Query> {
				public override method = "get" as const;
				public override querySerializer = serializer;
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

		// TYPESAFETY: the serializer tests below drive values `Query` excludes by
		// design, and a serializer takes unknown values. One cast here serves all
		// of them
		const captureAnyUrl = (
			query: Record<string, unknown>,
			serializer?: QuerySerializer,
		) =>
			// oxlint-disable-next-line typescript/no-unsafe-type-assertion
			captureUrl(query as Query, serializer);

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
				const url = await captureUrl({ tags: ["cat", "dog"] }, () => "fixed=1");

				expect(url.search).toBe("?fixed=1");
			});
		});

		// the style table of OAS 3.2 §4.12.6, one serializer per row
		describe("the OpenAPI styles", () => {
			const tags = { tags: ["cat", "dog"] };
			const at = { at: { gt: 1, lte: 2 } };

			test("form with explode repeats an array's key", async () => {
				const url = await captureUrl(tags, formSerializer);

				expect(url.searchParams.getAll("tags")).toStrictEqual(["cat", "dog"]);
			});

			// an unhoisted object would go out as "[object Object]"
			test("form with explode hoists an object's members", async () => {
				const url = await captureUrl(at, formSerializer);

				expect(url.search).toBe(
					`?${expected([
						["gt", "1"],
						["lte", "2"],
					])}`,
				);
			});

			test("form without explode joins on a comma", async () => {
				const url = await captureUrl(tags, formCommaSerializer);

				expect(url.searchParams.get("tags")).toBe("cat,dog");
			});

			// an object writes its member names and values alternating
			test("form without explode alternates an object's names and values", async () => {
				const url = await captureUrl(at, formCommaSerializer);

				expect(url.searchParams.get("at")).toBe("gt,1,lte,2");
			});

			// leaving the name behind would shift every pair after it
			test("form without explode drops an omitted member's name too", async () => {
				const url = await captureAnyUrl(
					{ at: { a: null, gt: 1, bad: undefined, lte: 2 } },
					formCommaSerializer,
				);

				expect(url.searchParams.get("at")).toBe("gt,1,lte,2");
			});

			test("spaceDelimited joins on a space", async () => {
				const url = await captureUrl(tags, spaceDelimitedSerializer);

				expect(url.searchParams.get("tags")).toBe("cat dog");
			});

			test("pipeDelimited joins on a pipe", async () => {
				const url = await captureUrl(tags, pipeDelimitedSerializer);

				expect(url.searchParams.get("tags")).toBe("cat|dog");
			});

			test("deepObject brackets each member under the parent name", async () => {
				const url = await captureUrl(at, deepObjectSerializer);

				expect(url.search).toBe(
					`?${expected([
						["at[gt]", "1"],
						["at[lte]", "2"],
					])}`,
				);
			});

			// two object parameters sharing a member name collide under form
			test("deepObject keeps two objects' shared member names apart", async () => {
				const url = await captureUrl(
					{ a: { gt: 1 }, effective_at: { gt: 2 } },
					deepObjectSerializer,
				);

				expect(url.search).toBe(
					`?${expected([
						["a[gt]", "1"],
						["effective_at[gt]", "2"],
					])}`,
				);
			});

			// §4.12.3 leaves anything but an object undefined for deepObject
			test("deepObject writes a scalar parameter as form does", async () => {
				const url = await captureUrl(
					{ limit: 20, ...at },
					deepObjectSerializer,
				);

				expect(url.searchParams.get("limit")).toBe("20");
			});

			test("every style omits null and undefined", async () => {
				const urls = await Promise.all(
					[
						formSerializer,
						formCommaSerializer,
						spaceDelimitedSerializer,
						pipeDelimitedSerializer,
						deepObjectSerializer,
					].map((serializer) =>
						captureUrl({ a: null, b: undefined, c: "keep" }, serializer),
					),
				);

				for (const url of urls) {
					expect(url.search).toBe(`?${expected([["c", "keep"]])}`);
				}
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
