import { describe, expect, test } from "vitest";
import {
	createQueryStringSerializer,
	defaultQuerySerializer,
} from "../src/main.ts";

// url.search is where the client puts a serialized query
function roundTrip(serialized: string, name = "a") {
	const url = new URL("https://192.0.2.1/");
	url.search = serialized;

	return { read: url.searchParams.get(name), search: url.search.slice(1) };
}

const serializers = [
	["defaultQuerySerializer", defaultQuerySerializer],
	["createQueryStringSerializer", createQueryStringSerializer()],
] as const;

describe.each(serializers)("%s", (_name, serialize) => {
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
		expect(roundTrip(serialize({ a: value })).read).toBe(value);
	});

	test("a name takes the same encoding as a value", () => {
		expect(roundTrip(serialize({ "a b": "c" }), "a b").read).toBe("c");
	});

	// assigning to url.search re-encodes a space, a quote, # and < >, so the
	// serializer encodes them itself
	test("url.search returns the bytes the serializer wrote", () => {
		const search = serialize({ a: "one two", b: `"quoted"`, c: "x#y" });

		expect(roundTrip(search).search).toBe(search);
	});

	// encodeURIComponent throws URIError on an unpaired surrogate
	test("a lone surrogate writes U+FFFD rather than throwing", () => {
		expect(roundTrip(serialize({ a: "\uD800" })).read).toBe("�");
	});
});
