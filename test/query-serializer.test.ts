import {
	createQueryStringSerializer,
	defaultQuerySerializer,
} from "@block65/rest-client";
import { describe, expect, test } from "vitest";
import { typedObjectEntries } from "../lib/utils.ts";

// url.search is where the client puts a serialized query
function parseSearch(serialized: string, name = "a") {
	const url = new URL("https://192.0.2.1/");
	url.search = serialized;

	return { value: url.searchParams.get(name), search: url.search.slice(1) };
}

const serializers = {
	defaultQuerySerializer,
	queryStringSerializer: createQueryStringSerializer(),
} as const;

describe.each(typedObjectEntries(serializers))("%s", (_name, serialize) => {
	test.each([
		["a space", "one two three"],
		["a plus", "a+b"],
		["a percent", "100% sure"],
		["reserved characters", "a&b=c?d#e/f"],
		["brackets and quotes", `a[b] "c" 'd'`],
		["the RFC 3986 sub-delimiters", "!'()*"],
		["unicode", "café 🎉"],
		["a value that looks encoded", "%20%2B"],
	])("%s reads back as it went in", (_case, value) => {
		expect(parseSearch(serialize({ a: value })).value).toBe(value);
	});

	test("a name takes the same encoding as a value", () => {
		expect(parseSearch(serialize({ "a b": "c" }), "a b").value).toBe("c");
	});

	// assigning to url.search re-encodes a space, a quote, # and < >, so the
	// serializer encodes them itself
	test("url.search returns the bytes the serializer wrote", () => {
		const search = serialize({ a: "one two", b: `"quoted"`, c: "x#y" });

		expect(parseSearch(search).search).toBe(search);
	});

	// encodeURIComponent throws URIError on an unpaired surrogate
	test("a lone surrogate writes U+FFFD rather than throwing", () => {
		expect(parseSearch(serialize({ a: "\uD800" })).value).toBe("�");
	});
});

// the default's bytes, stated once so a change to the encoding shows here
describe("the default serializer's output", () => {
	test.each([
		["a plain string", { a: "one" }],
		["an array", { a: ["one", "two"] }],
		["a nested object, hoisted", { effective_at: { gt: 1, lte: 2 } }],
		// oxlint-disable-next-line unicorn-unported/prefer-temporal -- Date interop
		["a Date, through toJSON", { at: new Date(0) }],
		["null", { a: null, b: "keep" }],
		["undefined", { a: undefined, b: "keep" }],
		["a space", { a: "one two" }],
		["reserved characters", { a: "a&b=c#d?e/f" }],
		["unicode", { a: "café 🎉" }],
		["a lone surrogate", { a: "\uD800" }],
	])("%s", (_case, query) => {
		expect(defaultQuerySerializer(query)).toMatchSnapshot();
	});

	test.each([
		["a space", "one two"],
		["reserved characters", "a&b=c#d?e/f"],
		["unicode", "café 🎉"],
		["a plus", "a+b"],
	])("%s survives url.search and searchParams.get", (_case, value) => {
		const url = new URL("https://192.0.2.1/");
		url.search = defaultQuerySerializer({ a: value });

		expect(url.searchParams.get("a")).toBe(value);
		expect(url.search.slice(1)).toBe(defaultQuerySerializer({ a: value }));
	});
});
