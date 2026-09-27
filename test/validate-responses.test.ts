import {
	Command,
	PublicValidationError,
	ResponseValidationError,
	RestServiceClient,
	jsonStringify,
	validate,
} from "@block65/rest-client";
import type { Jsonifiable } from "type-fest";
import * as v from "valibot";
import { assert, describe, expect, test } from "vitest";

const fakeUrl = new URL("https://192.0.2.1");

const billingAccountSchema = v.strictObject({
	id: v.pipe(v.string(), v.transform<string, bigint>(BigInt)),
	name: v.string(),
});

type BillingAccount = v.InferOutput<typeof billingAccountSchema>;

class GetAccountCommand extends Command<unknown, BillingAccount> {
	public override method = "get" as const;

	public override readonly responseSchema = billingAccountSchema;

	constructor() {
		super("/account");
	}
}

class GetAccountUnvalidatedCommand extends Command<
	unknown,
	{ id: string; name: string }
> {
	public override method = "get" as const;

	constructor() {
		super("/account");
	}
}

function makeFetcher(body: Jsonifiable) {
	return async () => ({
		url: fakeUrl,
		body,
		res: new Response(null, {
			status: 200,
			statusText: "OK",
			headers: new Headers({ "content-type": "application/json" }),
		}),
	});
}

describe("jsonStringify", () => {
	test("serializes nested BigInt values", () => {
		expect(
			jsonStringify({ a: [BigInt(1), BigInt(2)], b: { c: BigInt(3) } }),
		).toBe('{"a":["1","2"],"b":{"c":"3"}}');
	});

	test("passes through non-BigInt values unchanged", () => {
		expect(jsonStringify({ s: "hi", n: 1, b: true, nul: null })).toBe(
			'{"s":"hi","n":1,"b":true,"nul":null}',
		);
	});

	test("handles top-level BigInt", () => {
		expect(jsonStringify(BigInt(42))).toBe('"42"');
	});
});

describe("response validation (schema presence drives it)", () => {
	test("parses the response through responseSchema when present", async () => {
		const client = new RestServiceClient(fakeUrl, {
			fetcher: makeFetcher({ id: "123", name: "Alice" }),
		});

		const result = await client.json(new GetAccountCommand());

		expect(result.id).toBe(BigInt(123));
		expect(result.name).toBe("Alice");
	});

	test("passes body through unchanged when command has no responseSchema", async () => {
		const client = new RestServiceClient(fakeUrl, {
			fetcher: makeFetcher({ id: "123", name: "Alice" }),
		});

		const result = await client.json(new GetAccountUnvalidatedCommand());

		expect(result.id).toBe("123");
		expect(result.name).toBe("Alice");
	});

	test("throws ResponseValidationError carrying command + url + cause on schema mismatch", async () => {
		const client = new RestServiceClient(fakeUrl, {
			fetcher: makeFetcher({ id: 123, name: "Alice" }),
		});

		const command = new GetAccountCommand();
		const rejection = await client.json(command).catch((err: unknown) => err);

		assert(rejection instanceof ResponseValidationError);
		expect(rejection.command).toBe(command);
		expect(rejection.url.toString()).toContain("/account");
		expect(rejection.message).toContain("GET");
		expect(rejection.cause).toBeDefined();
	});

	test("also validates send() responses", async () => {
		const client = new RestServiceClient(fakeUrl, {
			fetcher: makeFetcher({ id: "123", name: "Alice" }),
		});

		const result = await client.send(new GetAccountCommand());

		expect(result.id).toBe(BigInt(123));
	});
});

describe("validate", () => {
	const nameSchema = v.string();

	const asyncNameSchema = v.pipeAsync(
		v.string(),
		v.checkAsync(async (name) => name.length > 0, "Name is empty"),
	);

	test("a Promise value is validated once it settles", async () => {
		await expect(validate(nameSchema, Promise.resolve("Alice"))).resolves.toBe(
			"Alice",
		);
	});

	test("an async schema resolves its output", async () => {
		await expect(validate(asyncNameSchema, "Alice")).resolves.toBe("Alice");
	});

	test("an async schema rejects its issues as a PublicValidationError", async () => {
		const rejection = await Promise.resolve(
			validate(asyncNameSchema, ""),
		).catch((err: unknown) => err);

		assert(rejection instanceof PublicValidationError);
		expect(rejection.message).toBe("Name is empty");
	});
});

describe("responseValidator", () => {
	test("a body it refuses rejects as a ResponseValidationError", async () => {
		const client = new RestServiceClient(fakeUrl, {
			fetcher: makeFetcher({ id: "123", name: "Alice" }),
			responseValidator: () => false,
		});

		const command = new GetAccountUnvalidatedCommand();
		const rejection = await client.json(command).catch((err: unknown) => err);

		assert(rejection instanceof ResponseValidationError);
		expect(rejection.command).toBe(command);
	});
});
