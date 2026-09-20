import {
	createQueryStringSerializer,
	deepObjectSerializer,
	defaultQuerySerializer,
	formCommaSerializer,
	formSerializer,
	pipeDelimitedSerializer,
	type QuerySerializer,
	searchParamsSerializer,
	spaceDelimitedSerializer,
} from "@block65/rest-client";
import { describe, expect, test } from "vitest";

// https://spec.openapis.org/oas/v3.2.0.html#style-examples uses these three
const primitive = { id: 5 };
const array = { id: [3, 4, 5] };
const object = { id: { role: "admin", firstName: "Alex" } };

const every: [string, QuerySerializer][] = [
	["searchParams", searchParamsSerializer],
	["form", formSerializer],
	["formComma", formCommaSerializer],
	["spaceDelimited", spaceDelimitedSerializer],
	["pipeDelimited", pipeDelimitedSerializer],
	["deepObject", deepObjectSerializer],
];

describe("the OAS style table", () => {
	test.each([
		[
			"form with explode",
			formSerializer,
			"id=5",
			"id=3&id=4&id=5",
			"role=admin&firstName=Alex",
		],
		[
			"form",
			formCommaSerializer,
			"id=5",
			"id=3,4,5",
			"id=role,admin,firstName,Alex",
		],
		[
			"spaceDelimited",
			spaceDelimitedSerializer,
			"id=5",
			"id=3%204%205",
			"id=role%20admin%20firstName%20Alex",
		],
		[
			"pipeDelimited",
			pipeDelimitedSerializer,
			"id=5",
			"id=3|4|5",
			"id=role|admin|firstName|Alex",
		],
	])("%s", (_style, serializer, forPrimitive, forArray, forObject) => {
		expect(serializer(primitive)).toBe(forPrimitive);
		expect(serializer(array)).toBe(forArray);
		expect(serializer(object)).toBe(forObject);
	});

	// the OAS example writes the brackets as they are, `id[role]=admin`
	test("deepObject with explode", () => {
		expect(deepObjectSerializer(object)).toBe(
			"id[role]=admin&id[firstName]=Alex",
		);
	});

	// the default writes an object as JSON, outside the OAS table
	test("searchParams, the default", () => {
		expect(searchParamsSerializer(primitive)).toBe("id=5");
		expect(searchParamsSerializer(array)).toBe("id=3&id=4&id=5");
		expect(searchParamsSerializer(object)).toBe(
			"id=%7B%22role%22%3A%22admin%22%2C%22firstName%22%3A%22Alex%22%7D",
		);
	});
});

describe("utf-8", () => {
	test.each(every)("%s encodes a name and a value as utf-8", (_name, fn) => {
		expect(fn({ café: "crème" })).toBe("caf%C3%A9=cr%C3%A8me");
	});

	test.each(every)("%s encodes an emoji as its four bytes", (_name, fn) => {
		expect(fn({ party: "🎉" })).toBe("party=%F0%9F%8E%89");
	});

	// encodeURIComponent throws URIError on an unpaired surrogate, and
	// toWellFormed replaces it with U+FFFD first
	test.each(every)("%s writes a lone surrogate as U+FFFD", (_name, fn) => {
		expect(fn({ a: "\uD800" })).toBe("a=%EF%BF%BD");
	});
});

describe("a value holding the delimiter", () => {
	// a comma and a pipe inside a value stay encoded, so a server splitting on
	// the raw byte reads back two parts
	test("a comma and a pipe stay apart from the separator", () => {
		expect(formCommaSerializer({ id: ["a,b", "c"] })).toBe("id=a%2Cb,c");
		expect(pipeDelimitedSerializer({ id: ["a|b", "c"] })).toBe("id=a%7Cb|c");
	});

	// a space encodes to the separator itself, so these two queries are equal
	// on the wire. OAS 3.2 gives spaceDelimited no way to tell them apart
	test("a space reads back as a separator", () => {
		expect(spaceDelimitedSerializer({ id: ["a b", "c"] })).toBe("id=a%20b%20c");
		expect(spaceDelimitedSerializer({ id: ["a", "b", "c"] })).toBe(
			"id=a%20b%20c",
		);
	});
});

// form hoists members, so two objects can supply the same name
test("form keeps both values when two objects share a member", () => {
	expect(formSerializer({ a: { gt: 1 }, b: { gt: 2 } })).toBe("gt=1&gt=2");
});

// the client assigns the output to url.search, which must give back the
// same bytes
describe("url.search round trip", () => {
	const queries: Record<string, unknown>[] = [
		primitive,
		array,
		object,
		{ café: "crème", party: "🎉" },
		{ q: "a b&c=d#e", pct: "100%", already: "%20" },
		{ plus: "a+b", quote: "it's", brackets: "a[b]" },
	];

	test.each(every)("%s", (_name, fn) => {
		for (const query of queries) {
			const search = fn(query);
			const url = new URL("https://192.0.2.1/");
			url.search = search;

			expect(url.search).toBe(`?${search}`);
		}
	});
});

// the client's default, writing the bytes 14.0.1 put on the wire
describe("defaultQuerySerializer", () => {
	test("a space is +, where the percent-encoded styles write %20", () => {
		expect(defaultQuerySerializer({ a: "x y" })).toBe("a=x+y");
		expect(searchParamsSerializer({ a: "x y" })).toBe("a=x%20y");
	});

	test("an array repeats its key and null and undefined drop out", () => {
		expect(defaultQuerySerializer({ id: [3, null, 4, undefined] })).toBe(
			"id=3&id=4",
		);
	});

	test("an object writes as JSON rather than [object Object]", () => {
		expect(defaultQuerySerializer({ a: { b: 1 } })).toBe("a=%7B%22b%22%3A1%7D");
	});
});

// query-string reaches the shapes a repeated key cannot
describe("createQueryStringSerializer", () => {
	test("arrayFormat comma joins an array under one key", () => {
		expect(
			createQueryStringSerializer({ arrayFormat: "comma" })({ id: [3, 4, 5] }),
		).toBe("id=3,4,5");
	});

	test("arrayFormat bracket repeats the key with brackets", () => {
		expect(
			createQueryStringSerializer({ arrayFormat: "bracket" })({ id: [3, 4] }),
		).toBe("id[]=3&id[]=4");
	});

	test("without options it repeats the key", () => {
		expect(createQueryStringSerializer()({ id: [3, 4] })).toBe("id=3&id=4");
	});
});
