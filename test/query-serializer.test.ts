import {
	type QuerySerializer,
	deepObjectSerializer,
	formExplodeSerializer,
	formSerializer,
	pipeDelimitedSerializer,
	spaceDelimitedSerializer,
} from "@block65/rest-client";
import { describe, expect, test } from "vitest";
import { typedObjectEntries } from "../lib/utils.ts";

type Type = "undefined" | "string" | "array" | "object";

type Row = [
	style: string,
	serialize: QuerySerializer,
	written: Record<Type, string>,
];

// OpenAPI 3.2 §4.12.6, where the undefined column is null in the data
const color = {
	undefined: null,
	string: "blue",
	array: ["blue", "black", "brown"],
	object: { R: 100, G: 200, B: 150 },
} satisfies Record<Type, unknown>;

// the spec's style examples table, each query row's serializedValue
const rows: Row[] = [
	[
		"form, explode false",
		formSerializer,
		{
			undefined: "color=",
			string: "color=blue",
			array: "color=blue,black,brown",
			object: "color=R,100,G,200,B,150",
		},
	],
	[
		"form, explode true",
		formExplodeSerializer,
		{
			undefined: "color=",
			string: "color=blue",
			array: "color=blue&color=black&color=brown",
			object: "R=100&G=200&B=150",
		},
	],
	[
		"spaceDelimited",
		spaceDelimitedSerializer,
		{
			// n/a in the spec, written as form so a scalar parameter survives
			undefined: "color=",
			string: "color=blue",
			array: "color=blue%20black%20brown",
			object: "color=R%20100%20G%20200%20B%20150",
		},
	],
	[
		"pipeDelimited",
		pipeDelimitedSerializer,
		{
			// n/a in the spec, written as form so a scalar parameter survives
			undefined: "color=",
			string: "color=blue",
			array: "color=blue%7Cblack%7Cbrown",
			object: "color=R%7C100%7CG%7C200%7CB%7C150",
		},
	],
	[
		"deepObject",
		deepObjectSerializer,
		{
			// n/a in the spec, written as form so a scalar parameter survives
			undefined: "color=",
			string: "color=blue",
			array: "color=blue&color=black&color=brown",
			object: "color%5BR%5D=100&color%5BG%5D=200&color%5BB%5D=150",
		},
	],
];

describe.each(rows)("%s", (_style, serialize, written) => {
	test.each(typedObjectEntries(color))("%s", (type, value) => {
		expect(serialize({ color: value })).toBe(written[type]);
	});

	// url.search is where the client puts the result, and the URL parser
	// re-encodes a raw space, quote, # and < >
	test("url.search returns what was written", () => {
		const url = new URL("https://192.0.2.1/");

		for (const value of Object.values(color)) {
			const search = serialize({ color: value });
			url.search = search;
			expect(url.search.slice(1)).toBe(search);
		}
	});

	// what the spec leaves to the implementation, recorded once and reviewed
	test.each([
		["an undefined parameter", { color: undefined, other: "kept" }],
		["an empty array", { color: [], other: "kept" }],
		// query-string sorts unless told not to, and the client owns the order
		["parameters written out of order", { z: "1", a: "2" }],
		// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop
		["a Date, through toJSON", { at: new Date(0) }],
		["a lone surrogate", { color: "\uD800" }],
	])("%s", (_case, query) => {
		expect(serialize(query)).toMatchSnapshot();
	});

	test("a value with no string form is refused by name", () => {
		expect(() =>
			serialize({ color: new Map() }),
		).toThrowErrorMatchingSnapshot();
	});
});

// §4.12.8, the parameter object examples that serialize a query
describe("the spec's parameter examples", () => {
	test("an array query parameter, exploded, with spaces as %20", () => {
		expect(
			formExplodeSerializer({ thing: ["one thing", "another thing"] }),
		).toBe("thing=one%20thing&thing=another%20thing");
	});

	test("a free-form object of integers", () => {
		expect(formExplodeSerializer({ freeForm: { page: 4, pageSize: 50 } })).toBe(
			"page=4&pageSize=50",
		);
	});

	// the path example, since the encoding is the same
	test("unicode is percent-encoded as UTF-8", () => {
		expect(formExplodeSerializer({ username: "diṅnāga" })).toBe(
			"username=di%E1%B9%85n%C4%81ga",
		);
	});
});

// §4.12.4 encodes everything outside RFC 3986's unreserved set, and a
// delimiter used for its reserved purpose stays raw
describe("percent-encoding", () => {
	test.each([
		[
			"reserved characters in a value",
			formExplodeSerializer,
			{ a: "b&c=d?e#f/g+h" },
		],
		[
			"the sub-delimiters encodeURIComponent leaves",
			formExplodeSerializer,
			{ a: "!'()*" },
		],
		[
			"a comma in a value beside the comma between items",
			formSerializer,
			{ a: ["x,y", "z"] },
		],
		[
			"a pipe in a value beside the pipe separator",
			pipeDelimitedSerializer,
			{ a: ["x|y", "z"] },
		],
		[
			"a space in a value beside the space separator",
			spaceDelimitedSerializer,
			{ a: ["x y", "z"] },
		],
		["a name", formExplodeSerializer, { "a b": "c" }],
	])("%s", (_case, serialize, query) => {
		expect(serialize(query)).toMatchSnapshot();
	});
});

// the spec leaves an array or object member undefined for every style
describe("nesting", () => {
	test.each([
		["form", formSerializer],
		["form with explode", formExplodeSerializer],
		["spaceDelimited", spaceDelimitedSerializer],
		["pipeDelimited", pipeDelimitedSerializer],
		["deepObject", deepObjectSerializer],
	])("%s refuses a nested object", (_style, serialize) => {
		expect(() =>
			serialize({ color: { R: { deep: 1 } } }),
		).toThrowErrorMatchingSnapshot();
	});

	test("deepObject refuses an array member", () => {
		expect(() =>
			deepObjectSerializer({ color: { R: [1, 2] } }),
		).toThrowErrorMatchingSnapshot();
	});
});
