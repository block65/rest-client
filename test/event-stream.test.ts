import {
	type Command,
	EventStreamCommand,
	type ParsedStreamEvent,
	ResponseValidationError,
	createEventStreamTransformer,
	RestServiceClient,
	createIsomorphicNativeFetcher,
} from "@block65/rest-client";
import * as v from "valibot";
import { assert, expect, expectTypeOf, test, vi } from "vitest";

const transferSchema = v.strictObject({ id: v.string(), bytes: v.number() });

// a transfer event's data is the transfer, a reset event's its sequence number
const activityDataSchema = v.union([transferSchema, v.number()]);

type ActivityData = v.InferOutput<typeof activityDataSchema>;

class StreamActivityCommand extends EventStreamCommand<never, ActivityData> {
	public override method = "get" as const;

	constructor() {
		super("/activity");
	}
}

class ValidatedStreamActivityCommand extends StreamActivityCommand {
	public override readonly dataSchema = activityDataSchema;
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

	expectTypeOf(stream).toEqualTypeOf<
		ReadableStream<ParsedStreamEvent<ActivityData>>
	>();

	await expect(collect(stream)).resolves.toStrictEqual([
		{ type: "reset", lastEventId: "7", data: 7, retry: undefined },
		{
			type: "transfer",
			lastEventId: "8",
			data: { id: "t1", bytes: 3 },
			retry: undefined,
		},
	]);

	const [, init] = fetch.mock.calls[0] ?? [];

	expect(new Headers(init?.headers).get("accept")).toBe("text/event-stream");
});

test("splits an event-stream body into events with their data as text", async () => {
	const events = new Response(feed).body?.pipeThrough(
		createEventStreamTransformer(),
	);

	assert(events);

	await expect(collect(events)).resolves.toStrictEqual([
		{ type: "reset", lastEventId: "7", data: "7", retry: undefined },
		{
			type: "transfer",
			lastEventId: "8",
			data: '{"id":"t1","bytes":3}',
			retry: undefined,
		},
	]);
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
