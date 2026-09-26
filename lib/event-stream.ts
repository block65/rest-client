import {
	type ServerSentEvent,
	ServerSentEventTransformStream,
} from "parse-sse";
import { type CommandQueryObject, SequentialMediaCommand } from "./command.ts";

/**
 * Maps an event name to the format of its `data`. An event not listed is
 * text
 */
export type EventData = Readonly<Record<string, "json" | "text">>;

export type StreamEvent = {
	event: string;
	data: unknown;
	id?: string;
	retry?: number;
};

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
 * A text/event-stream response, one item per event. parse-sse drops
 * comments and events with empty data, as the HTML spec does
 */
export abstract class EventStreamCommand<
	CommandInput = unknown,
	CommandEvent extends StreamEvent = StreamEvent,
	CommandQuery extends CommandQueryObject = CommandQueryObject,
	CommandHeaders extends Record<string, string> = Record<string, string>,
> extends SequentialMediaCommand<
	CommandInput,
	CommandEvent,
	CommandQuery,
	CommandHeaders
> {
	public readonly mediaType = "text/event-stream";

	public readonly eventData: EventData = {};

	public parse(body: ReadableStream<Uint8Array<ArrayBuffer>>) {
		const { eventData } = this;

		return body
			.pipeThrough(new TextDecoderStream())
			.pipeThrough(new ServerSentEventTransformStream())
			.pipeThrough(
				new TransformStream<ServerSentEvent, CommandEvent>({
					transform(message, controller) {
						// toStreamEvent fixes the shape, and the command's event type
						// narrows names and data unchecked, as json() narrows a body
						// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- by design
						const event = toStreamEvent(message, eventData) as CommandEvent;

						controller.enqueue(event);
					},
				}),
			);
	}
}
