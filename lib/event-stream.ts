import {
	type ServerSentEvent,
	ServerSentEventTransformStream,
} from "parse-sse";
import type { RestServiceClient } from "./client.ts";
import { maybeResponseSchema } from "./client.ts";
import type { Command } from "./command.ts";
import { PublicValidationError, ResponseValidationError } from "./errors.ts";
import type { RuntimeOptions } from "./types.ts";

/**
 * How an event's `data` is decoded, keyed by event name. A generated command
 * declares it as `static eventData`, so decoding runs in production as well
 */
export type EventData = Readonly<Record<string, "json" | "text">>;

export type StreamEvent = {
	event: string;
	data: unknown;
	id?: string;
	retry?: number;
};

function eventDataOf(command: Command): EventData {
	const ctor = command.constructor;

	if ("eventData" in ctor && typeof ctor.eventData === "object") {
		// the generated static is an EventData literal
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generated
		return ctor.eventData as EventData;
	}

	return {};
}

function toStreamEvent(message: ServerSentEvent, eventData: EventData) {
	const data: unknown =
		eventData[message.type] === "json"
			? JSON.parse(message.data)
			: message.data;

	return {
		event: message.type,
		data,
		...(message.lastEventId !== "" && { id: message.lastEventId }),
		...(message.retry !== undefined && { retry: message.retry }),
	} satisfies StreamEvent;
}

/**
 * Follows a text/event-stream response as parsed events, `data` decoded by
 * the command's `eventData`. Where the command class declares a
 * `responseSchema` (the validated commands, in dev) each event is checked
 * against it, and a mismatch errors the stream with ResponseValidationError
 */
export async function events<InputType, Item>(
	client: RestServiceClient,
	command: Command<InputType, Item>,
	runtimeOptions?: RuntimeOptions,
): Promise<ReadableStream<Item>> {
	const bytes = await client.stream(command, {
		...runtimeOptions,
		headers: {
			accept: "text/event-stream",
			...Object.fromEntries(new Headers(runtimeOptions?.headers)),
		},
	});

	const eventData = eventDataOf(command);
	const schema = maybeResponseSchema(command);

	return bytes
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(new ServerSentEventTransformStream())
		.pipeThrough(
			new TransformStream<ServerSentEvent, Item>({
				async transform(message, controller) {
					const item = toStreamEvent(message, eventData);

					if (!schema) {
						// the command's output type describes its events
						// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- by design
						controller.enqueue(item as Item);

						return;
					}

					const result = await schema["~standard"].validate(item);

					if (result.issues) {
						controller.error(
							new ResponseValidationError(
								command,
								undefined,
								PublicValidationError.fromIssues(result.issues),
							),
						);

						return;
					}

					controller.enqueue(result.value);
				},
			}),
		);
}
