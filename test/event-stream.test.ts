import {
	type Command,
	EventStreamCommand,
	ResponseValidationError,
	RestServiceClient,
	createIsomorphicNativeFetcher,
} from "@block65/rest-client";
import * as v from "valibot";
import { assert, expect, expectTypeOf, test, vi } from "vitest";

const transferSchema = v.strictObject({ id: v.string(), bytes: v.number() });

const activityMessageSchema = v.variant("event", [
	v.strictObject({
		event: v.literal("transfer"),
		id: v.string(),
		data: transferSchema,
	}),
	v.strictObject({
		event: v.literal("reset"),
		id: v.string(),
		data: v.string(),
	}),
]);

type ActivityMessage = v.InferOutput<typeof activityMessageSchema>;

class StreamActivityCommand extends EventStreamCommand<never, ActivityMessage> {
	public override method = "get" as const;

	public override readonly eventData = { transfer: "json" } as const;

	constructor() {
		super("/activity");
	}
}

class ValidatedStreamActivityCommand extends StreamActivityCommand {
	static itemSchema = activityMessageSchema;
}

function clientFor(body: string) {
	const fetch = vi.fn<typeof globalThis.fetch>(
		async () =>
			new Response(body, { headers: { "content-type": "text/event-stream" } }),
	);

	const client = new RestServiceClient(new URL("http://127.0.0.1"), {
		fetcher: createIsomorphicNativeFetcher({ fetch }),
	});

	return { client, fetch };
}

async function collect<T>(stream: ReadableStream<T>) {
	const items: T[] = [];

	for await (const item of stream) {
		items.push(item);
	}

	return items;
}

const feed = [
	": keepalive",
	"",
	"event: reset",
	"id: 7",
	"data: 7",
	"",
	"event: transfer",
	"id: 8",
	'data: {"id":"t1","bytes":3}',
	"",
	"",
].join("\n");

test("yields events with JSON data decoded, comments dropped", async () => {
	const { client, fetch } = clientFor(feed);

	const stream = await client.stream(new StreamActivityCommand());

	expectTypeOf(stream).toEqualTypeOf<ReadableStream<ActivityMessage>>();

	await expect(collect(stream)).resolves.toStrictEqual([
		{ event: "reset", id: "7", data: "7" },
		{ event: "transfer", id: "8", data: { id: "t1", bytes: 3 } },
	]);

	const [, init] = fetch.mock.calls[0] ?? [];

	expect(new Headers(init?.headers).get("accept")).toBe("text/event-stream");
});

test("validates each event when the command declares a schema", async () => {
	const { client } = clientFor(
		["event: transfer", "id: 9", 'data: {"id":"t2"}', "", ""].join("\n"),
	);

	const stream = await client.stream(new ValidatedStreamActivityCommand());

	const rejection = await collect(stream).catch((err: unknown) => err);

	assert(rejection instanceof ResponseValidationError);
	expect(rejection.url.pathname).toBe("/activity");
});

test("passes valid events through a declared schema", async () => {
	const { client } = clientFor(feed);

	const stream = await client.stream(new ValidatedStreamActivityCommand());

	await expect(collect(stream)).resolves.toHaveLength(2);
});

test("a runtime accept header overrides the media type", async () => {
	const { client, fetch } = clientFor(feed);

	const stream = await client.stream(new StreamActivityCommand(), {
		headers: { accept: "text/event-stream;q=1" },
	});
	await stream.cancel();

	const [, init] = fetch.mock.calls[0] ?? [];

	expect(new Headers(init?.headers).get("accept")).toBe(
		"text/event-stream;q=1",
	);
});

test("json() and send() refuse a sequential media command", () => {
	const { client } = clientFor(feed);

	expectTypeOf<StreamActivityCommand>().not.toExtend<
		Parameters<typeof client.json>[0]
	>();
	expectTypeOf<StreamActivityCommand>().not.toExtend<
		Parameters<typeof client.send>[0]
	>();
	expectTypeOf<Command>().toExtend<Parameters<typeof client.json>[0]>();
});
