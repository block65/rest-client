import { createServer } from "node:http";
import getPort from "get-port";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import {
	Command,
	type QueryParamSpec,
	type QueryStyles,
	RestServiceClient,
	createIsomorphicNativeFetcher,
	parseQuery,
} from "../src/main.ts";
import { requestListener } from "./server.ts";

const port = await getPort();
const server = createServer(requestListener);

function expected(entries: [string, string][]) {
	return new URLSearchParams(entries).toString();
}

// reduces a URL to the shape a server receives, one entry per name
function flatten(url: URL) {
	return Object.fromEntries(
		[...new Set(url.searchParams.keys())].map((name) => {
			// getAll returns at least one value for a name the keys listed
			const [first = "", ...rest] = url.searchParams.getAll(name);

			return [name, rest.length > 0 ? [first, ...rest] : first];
		}),
	);
}

describe("a command's queryStyles", () => {
	const client = new RestServiceClient(new URL(`http://0.0.0.0:${port}`), {
		fetcher: createIsomorphicNativeFetcher({
			retry: { minTimeout: 1, maxTimeout: 5 },
		}),
	});

	beforeAll(() => {
		server.listen(port);
	});

	afterAll(() => {
		server.close();
	});

	type Query = UndefinedOnPartialDeep<{ [k in string]?: JsonValue }>;

	// an empty map still selects the styles path, where every parameter takes
	// the OAS default
	const captureUrl = async (query: Query, styles: QueryStyles = {}) => {
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

	// TYPESAFETY: the tests below drive values `Query` excludes by design, and
	// appendSearchParams takes unknown values. One cast here serves all of them
	const captureAnyUrl = (query: Record<string, unknown>) =>
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion
		captureUrl(query as Query);

	describe("form, explode: true (the OAS default)", () => {
		// OpenAI's ListAuditLogs effective_at states this style by omission,
		// and an unhoisted object would go out as "[object Object]"
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
			const url = await captureUrl({ changes: ["ENV A=1", "ENV B=2"] }, joined);
			expect(url.search).toBe(`?${expected([["changes", "ENV A=1,ENV B=2"]])}`);
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

	describe("round trip through parseQuery", () => {
		const roundTrip = async (
			query: Query,
			specs: readonly QueryParamSpec[],
		) => {
			const styles = Object.fromEntries(
				specs.map(({ name, style, explode }) => [name, { style, explode }]),
			);
			const url = await captureUrl(query, styles);

			return parseQuery(flatten(url), specs);
		};

		test("an array survives the default style", async () => {
			const result = await roundTrip({ tags: ["cat", "dog"] }, [
				{ name: "tags", type: "array", style: "form", explode: true },
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("a one-item array survives, where the wire loses the array", async () => {
			const result = await roundTrip({ tags: ["cat"] }, [
				{ name: "tags", type: "array", style: "form", explode: true },
			]);

			expect(result).toEqual({ tags: ["cat"] });
		});

		test("an object survives the default style, by its declared members", async () => {
			const result = await roundTrip({ effective_at: { gt: 1, lte: 2 } }, [
				{
					name: "effective_at",
					type: "object",
					style: "form",
					explode: true,
					members: ["gt", "lte"],
				},
			]);

			expect(result).toEqual({ effective_at: { gt: "1", lte: "2" } });
		});

		test("an array survives explode: false", async () => {
			const result = await roundTrip({ tags: ["cat", "dog"] }, [
				{ name: "tags", type: "array", style: "form", explode: false },
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("an object survives explode: false", async () => {
			const result = await roundTrip({ a: { colour: "red", size: "xl" } }, [
				{ name: "a", type: "object", style: "form", explode: false },
			]);

			expect(result).toEqual({ a: { colour: "red", size: "xl" } });
		});

		test("pipeDelimited survives explode: false", async () => {
			const result = await roundTrip({ tags: ["cat", "dog"] }, [
				{
					name: "tags",
					type: "array",
					style: "pipeDelimited",
					explode: false,
				},
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("spaceDelimited survives explode: false", async () => {
			const result = await roundTrip({ tags: ["cat", "dog"] }, [
				{
					name: "tags",
					type: "array",
					style: "spaceDelimited",
					explode: false,
				},
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("deepObject survives, parent name included", async () => {
			const result = await roundTrip({ a: { gt: 1, lte: 2 } }, [
				{ name: "a", type: "object", style: "deepObject", explode: true },
			]);

			expect(result).toEqual({ a: { gt: "1", lte: "2" } });
		});

		test("a nested object survives deepObject", async () => {
			const result = await roundTrip({ a: { b: { c: 1 } } }, [
				{ name: "a", type: "object", style: "deepObject", explode: true },
			]);

			expect(result).toEqual({ a: { b: { c: "1" } } });
		});

		test("objects inside an array survive deepObject indexing", async () => {
			const result = await roundTrip({ a: [{ b: 1 }, { b: 2 }] }, [
				{ name: "a", type: "object", style: "deepObject", explode: true },
			]);

			expect(result).toEqual({ a: [{ b: "1" }, { b: "2" }] });
		});

		test("nested arrays survive deepObject indexing", async () => {
			const result = await roundTrip({ a: [[1, 2], [3]] }, [
				{ name: "a", type: "object", style: "deepObject", explode: true },
			]);

			expect(result).toEqual({ a: [["1", "2"], ["3"]] });
		});

		// two object parameters under the default style send the same key, so it
		// arrives as one list and the first spec claims all of it
		test("the collision the encoder warns about is visible here too", async () => {
			const result = await roundTrip({ a: { id: 1 }, b: { id: 2 } }, [
				{
					name: "a",
					type: "object",
					style: "form",
					explode: true,
					members: ["id"],
				},
				{
					name: "b",
					type: "object",
					style: "form",
					explode: true,
					members: ["id"],
				},
			]);

			expect(result).toEqual({ a: { id: ["1", "2"] } });
		});
	});
});
