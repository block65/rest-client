import { ServerSentEventTransformStream } from "parse-sse";
import {
	type CommandHeadersObject,
	type CommandQueryObject,
} from "./command.ts";
import { SequentialMediaCommand } from "./sequential-media.ts";

export type ParsedStreamEvent<TData = string> = {
	type: string;

	data: TData;

	/**
	 * Last event ID of the stream when this event dispatched. It persists
	 * across events until an `id` field changes it
	 */
	lastEventId: string;

	retry: number | undefined;
};

/**
 * Splits a text/event-stream body into its events. Returns a new pair on
 * each call, as a stream pipes once
 */
export function createEventStreamTransformer() {
	const decoder = new TextDecoderStream();

	return {
		writable: decoder.writable,
		readable: decoder.readable.pipeThrough(
			new ServerSentEventTransformStream(),
		),
	};
}

/**
 * A `text/event-stream` response, one item per event. `parse-sse` drops
 * comments and events with empty data, as the HTML spec does
 */
export abstract class EventStreamCommand<
	TCommandInput = unknown,
	TCommandOutput = unknown,
	TCommandQuery extends CommandQueryObject = CommandQueryObject,
	TCommandHeaders extends CommandHeadersObject = CommandHeadersObject,
> extends SequentialMediaCommand<
	TCommandInput,
	TCommandOutput,
	TCommandQuery,
	TCommandHeaders,
	ParsedStreamEvent<TCommandOutput>
> {
	public readonly mediaType = "text/event-stream";

	public readonly createTransformer = createEventStreamTransformer;
}
