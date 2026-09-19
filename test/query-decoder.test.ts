import { assert, describe, expect, test } from "vitest";
import { parseQuery } from "../lib/query-decoder.ts";
import type { QueryParamSpec } from "../lib/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function spec(overrides: Partial<QueryParamSpec> = {}) {
	return {
		name: "a",
		type: "object",
		style: "form",
		explode: true,
		...overrides,
	} satisfies QueryParamSpec;
}

describe("parseQuery", () => {
	test("a parameter with no spec passes through untouched", () => {
		expect(parseQuery({ limit: "20", tags: ["cat", "dog"] }, [])).toEqual({
			limit: "20",
			tags: ["cat", "dog"],
		});
	});

	describe("form, explode: true (the OAS default)", () => {
		test("a single array occurrence becomes a one-item array", () => {
			const result = parseQuery({ tags: "cat" }, [
				spec({ name: "tags", type: "array" }),
			]);

			expect(result).toEqual({ tags: ["cat"] });
		});

		test("repeated keys are already an array", () => {
			const result = parseQuery({ tags: ["cat", "dog"] }, [
				spec({ name: "tags", type: "array" }),
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("an absent array parameter stays absent", () => {
			const result = parseQuery({ limit: "20" }, [
				spec({ name: "tags", type: "array" }),
			]);

			expect(result).toEqual({ limit: "20" });
		});

		test("declared members are hoisted back under the parent name", () => {
			const result = parseQuery({ gt: "1", lte: "2", limit: "20" }, [
				spec({ name: "effective_at", members: ["gt", "lte"] }),
			]);

			expect(result).toEqual({
				effective_at: { gt: "1", lte: "2" },
				limit: "20",
			});
		});

		test("only the declared members move", () => {
			const result = parseQuery({ gt: "1", other: "keep" }, [
				spec({ name: "effective_at", members: ["gt"] }),
			]);

			expect(result).toEqual({ effective_at: { gt: "1" }, other: "keep" });
		});

		test("an absent object parameter stays absent", () => {
			const result = parseQuery({ limit: "20" }, [
				spec({ name: "effective_at", members: ["gt", "lte"] }),
			]);

			expect(result).toEqual({ limit: "20" });
		});

		test("an object declaring no members contributes nothing", () => {
			const result = parseQuery({ gt: "1" }, [spec({ name: "effective_at" })]);

			expect(result).toEqual({ gt: "1" });
		});
	});

	describe("explode: false", () => {
		test("an array splits on the form delimiter", () => {
			const result = parseQuery({ tags: "cat,dog" }, [
				spec({ name: "tags", type: "array", explode: false }),
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("an object reads as alternating member name and value", () => {
			const result = parseQuery({ a: "colour,red,size,xl" }, [
				spec({ explode: false }),
			]);

			expect(result).toEqual({ a: { colour: "red", size: "xl" } });
		});

		test("a trailing member name with no value is dropped", () => {
			const result = parseQuery({ a: "colour,red,size" }, [
				spec({ explode: false }),
			]);

			expect(result).toEqual({ a: { colour: "red" } });
		});

		test("spaceDelimited splits on a space", () => {
			const result = parseQuery({ tags: "cat dog" }, [
				spec({
					name: "tags",
					type: "array",
					style: "spaceDelimited",
					explode: false,
				}),
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("pipeDelimited splits on a pipe", () => {
			const result = parseQuery({ tags: "cat|dog" }, [
				spec({
					name: "tags",
					type: "array",
					style: "pipeDelimited",
					explode: false,
				}),
			]);

			expect(result).toEqual({ tags: ["cat", "dog"] });
		});

		test("repeated keys each split and concatenate", () => {
			const result = parseQuery({ tags: ["cat,dog", "emu"] }, [
				spec({ name: "tags", type: "array", explode: false }),
			]);

			expect(result).toEqual({ tags: ["cat", "dog", "emu"] });
		});

		test("an absent parameter stays absent", () => {
			const result = parseQuery({ limit: "20" }, [
				spec({ name: "tags", type: "array", explode: false }),
			]);

			expect(result).toEqual({ limit: "20" });
		});
	});

	describe("deepObject", () => {
		const deep = spec({ style: "deepObject" });

		test("bracket keys rebuild the object", () => {
			const result = parseQuery({ "a[gt]": "1", "a[lte]": "2" }, [deep]);

			expect(result).toEqual({ a: { gt: "1", lte: "2" } });
		});

		test("nested brackets rebuild nested objects", () => {
			expect(parseQuery({ "a[b][c]": "1" }, [deep])).toEqual({
				a: { b: { c: "1" } },
			});
		});

		test("a dense run from zero reads back as an array", () => {
			expect(parseQuery({ "a[0]": "x", "a[1]": "y" }, [deep])).toEqual({
				a: ["x", "y"],
			});
		});

		test("indexed objects read back as an array of objects", () => {
			const result = parseQuery({ "a[0][b]": "1", "a[1][b]": "2" }, [deep]);

			expect(result).toEqual({ a: [{ b: "1" }, { b: "2" }] });
		});

		test("a run that does not start at zero stays an object", () => {
			expect(parseQuery({ "a[1]": "x" }, [deep])).toEqual({ a: { 1: "x" } });
		});

		test("a gap in the run stays an object", () => {
			expect(parseQuery({ "a[0]": "x", "a[2]": "y" }, [deep])).toEqual({
				a: { 0: "x", 2: "y" },
			});
		});

		test("other parameters are left where they are", () => {
			const result = parseQuery({ "a[b]": "1", limit: "20" }, [deep]);

			expect(result).toEqual({ a: { b: "1" }, limit: "20" });
		});

		test("the parameter arriving bare blocks any container", () => {
			const result = parseQuery({ a: "bare", "a[b]": "1" }, [deep]);

			expect(result).toEqual({ a: "bare", "a[b]": "1" });
		});

		test("an empty bracket group belongs to the name", () => {
			expect(parseQuery({ "a[]": "x" }, [deep])).toEqual({ "a[]": "x" });
		});

		test("a key past the depth bound is left as it arrived", () => {
			const key = "a[1][2][3][4][5][6][7][8][9]";

			expect(parseQuery({ [key]: "x" }, [deep])).toEqual({ [key]: "x" });
		});

		test("a key at the depth bound is decoded", () => {
			const result = parseQuery({ "a[1][2][3][4][5][6][7][8]": "x" }, [deep]);

			expect(result).toEqual({
				a: { 1: { 2: { 3: { 4: { 5: { 6: { 7: { 8: "x" } } } } } } } },
			});
		});

		test("a key conflicting with a placed container is left alone", () => {
			const result = parseQuery({ "a[b]": "1", "a[b][c]": "2" }, [deep]);

			expect(result).toEqual({ a: { b: "1" }, "a[b][c]": "2" });
		});

		test("a __proto__ segment is an ordinary member", () => {
			const { a: decoded } = parseQuery({ "a[__proto__][polluted]": "yes" }, [
				deep,
			]);

			assert(isRecord(decoded));
			expect(Object.getPrototypeOf(decoded)).toBeNull();
			expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
			expect(decoded.__proto__).toEqual({ polluted: "yes" });
			expect({}).not.toHaveProperty("polluted");
		});

		test("an absent parameter contributes nothing", () => {
			expect(parseQuery({ limit: "20" }, [deep])).toEqual({ limit: "20" });
		});
	});

	test("the input is not modified", () => {
		const query = { gt: "1", "a[b]": "2", tags: "cat" };

		parseQuery(query, [
			spec({ name: "effective_at", members: ["gt"] }),
			spec({ style: "deepObject" }),
			spec({ name: "tags", type: "array" }),
		]);

		expect(query).toEqual({ gt: "1", "a[b]": "2", tags: "cat" });
	});
});
