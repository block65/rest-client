import {
	Command,
	EventStreamCommand,
	type FetcherMethod,
	RestServiceClient,
	ServiceError,
	createIsomorphicNativeFetcher,
} from "@block65/rest-client";
import { afterEach, assert, expect, test, vi } from "vitest";

const objectPrototypeNames = Object.getOwnPropertyNames(Object.prototype);

// every case also fails if it left a property on the global prototype
afterEach(() => {
	assert.deepStrictEqual(
		Object.getOwnPropertyNames(Object.prototype),
		objectPrototypeNames,
	);
	assert.notProperty({}, "polluted");
});

function parseRecord(json: string) {
	const parsed: unknown = JSON.parse(json);

	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- every case parses an object
	return parsed as Record<string, string>;
}

class GetResourceCommand extends Command {
	public override method = "get" as const;

	constructor(
		query?: Record<string, string>,
		headers?: Record<string, string>,
	) {
		super("/resource", undefined, query, headers);
	}
}

class StreamResourceCommand extends EventStreamCommand {
	public override method = "get" as const;

	constructor() {
		super("/resource");
	}
}

function createClient(res: Response) {
	const fetch = vi.fn<typeof globalThis.fetch>(async () => res);

	const client = new RestServiceClient(new URL("http://127.0.0.1"), {
		fetcher: createIsomorphicNativeFetcher({ fetch }),
		sortQuery: true,
	});

	return { client, fetch };
}

function jsonResponse(body: string, status = 200) {
	return new Response(body, {
		status,
		statusText: "Refused",
		headers: { "content-type": "application/json" },
	});
}

test("a JSON body's __proto__ key stays an own property", async () => {
	const { client } = createClient(
		jsonResponse('{"__proto__":{"polluted":"1"},"a":1}'),
	);

	const body = await client.json(new GetResourceCommand());

	assert(typeof body === "object" && body !== null);
	expect(Object.getPrototypeOf(body)).toBe(Object.prototype);
	expect(Object.hasOwn(body, "__proto__")).toBe(true);
});

test("an error body's __proto__ cannot supply the message or code", async () => {
	const { client } = createClient(
		jsonResponse('{"__proto__":{"message":"injected","code":5}}', 400),
	);

	const rejection = await client
		.json(new GetResourceCommand())
		.catch((err: unknown) => err);

	assert(rejection instanceof ServiceError);
	expect(rejection.message).toBe("Refused");
	expect(rejection.code).toBe(ServiceError.UNKNOWN);
});

test("an error body's code of constructor is unknown", async () => {
	const { client } = createClient(
		jsonResponse('{"message":"m","code":"constructor"}', 400),
	);

	const rejection = await client
		.json(new GetResourceCommand())
		.catch((err: unknown) => err);

	assert(rejection instanceof ServiceError);
	expect(rejection.code).toBe(ServiceError.UNKNOWN);
});

test("an event named __proto__ with __proto__ data yields a plain item", async () => {
	const { client } = createClient(
		new Response(
			[
				"event: __proto__",
				'data: {"__proto__":{"polluted":"1"},"v":1}',
				'__proto__: {"type":"injected"}',
				"",
				"",
			].join("\n"),
			{ headers: { "content-type": "text/event-stream" } },
		),
	);

	const stream = await client.stream(new StreamResourceCommand());
	const [event] = await Array.fromAsync(stream);

	assert(event);
	expect(Object.getPrototypeOf(event)).toBe(Object.prototype);
	expect(event.type).toBe("__proto__");
	assert(typeof event.data === "object" && event.data !== null);
	expect(Object.getPrototypeOf(event.data)).toBe(Object.prototype);
	expect(Object.hasOwn(event.data, "__proto__")).toBe(true);
});

test("a header named __proto__ reaches the fetcher as an own property", async () => {
	const fetcher = vi.fn<FetcherMethod>(async ({ url }) => ({
		url,
		res: new Response(null, { status: 204 }),
	}));

	const client = new RestServiceClient(new URL("http://127.0.0.1"), {
		fetcher,
	});

	const headers = parseRecord('{"__proto__":"injected"}');

	await client.send(new GetResourceCommand(undefined, headers), { headers });

	const [params] = fetcher.mock.calls[0] ?? [];

	assert(params?.headers);
	expect(Object.getPrototypeOf(params.headers)).toBe(Object.prototype);
	expect(Object.hasOwn(params.headers, "__proto__")).toBe(true);
});

test("a query with a __proto__ parameter keeps its other parameters", async () => {
	const { client, fetch } = createClient(new Response(null, { status: 204 }));

	await client.send(
		new GetResourceCommand(
			parseRecord('{"z":"1","__proto__":{"polluted":"1"},"a":"2"}'),
		),
	);

	const [url] = fetch.mock.calls[0] ?? [];

	assert(url instanceof URL);
	const { searchParams } = url;

	expect(searchParams.get("a")).toBe("2");
	expect(searchParams.get("z")).toBe("1");
});

test("parameters named constructor and prototype are sent as any other", async () => {
	const { client, fetch } = createClient(new Response(null, { status: 204 }));

	await client.send(
		new GetResourceCommand(parseRecord('{"constructor":"1","prototype":"2"}')),
	);

	const [url] = fetch.mock.calls[0] ?? [];

	assert(url instanceof URL);
	const { searchParams } = url;

	expect(searchParams.get("constructor")).toBe("1");
	expect(searchParams.get("prototype")).toBe("2");
});
