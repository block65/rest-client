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

	// JSON.stringify leaves an undefined member out, and so does every style
	test("an undefined parameter is absent", () => {
		expect(serialize({ color: undefined, other: "kept" })).toBe("other=kept");
	});

	test("an empty array is absent", () => {
		expect(serialize({ color: [], other: "kept" })).toBe("other=kept");
	});

	test("parameters keep the order they were written in", () => {
		expect(serialize({ z: "1", a: "2" })).toBe("z=1&a=2");
	});

	test("a Date is written as its toJSON", () => {
		// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop
		expect(serialize({ at: new Date(0) })).toBe(
			"at=1970-01-01T00%3A00%3A00.000Z",
		);
	});

	test("a value with no string form is refused by name", () => {
		expect(() => serialize({ color: new Map() })).toThrow(
			/query parameter color/,
		);
	});

	test("a lone surrogate writes U+FFFD rather than throwing", () => {
		const url = new URL("https://192.0.2.1/");
		url.search = serialize({ color: "\uD800" });
		expect(url.searchParams.get("color")).toBe("�");
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
	test("reserved characters in a value are encoded", () => {
		expect(formExplodeSerializer({ a: "b&c=d?e#f/g+h" })).toBe(
			"a=b%26c%3Dd%3Fe%23f%2Fg%2Bh",
		);
	});

	test("the RFC 3986 sub-delimiters encodeURIComponent leaves are encoded", () => {
		expect(formExplodeSerializer({ a: "!'()*" })).toBe("a=%21%27%28%29%2A");
	});

	test("a comma in a value is encoded, a comma between items is not", () => {
		expect(formSerializer({ a: ["x,y", "z"] })).toBe("a=x%2Cy,z");
	});

	test("a pipe in a value is encoded like the separator", () => {
		expect(pipeDelimitedSerializer({ a: ["x|y", "z"] })).toBe("a=x%7Cy%7Cz");
	});

	test("a name takes the same encoding as a value", () => {
		expect(formExplodeSerializer({ "a b": "c" })).toBe("a%20b=c");
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
		expect(() => serialize({ color: { R: { deep: 1 } } })).toThrow(TypeError);
	});

	test("deepObject refuses an array member", () => {
		expect(() => deepObjectSerializer({ color: { R: [1, 2] } })).toThrow(
			TypeError,
		);
	});
});
