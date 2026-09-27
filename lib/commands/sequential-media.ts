import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { UndefinedOnPartialDeep } from "type-fest";
import { ResponseValidationError } from "../errors.ts";
import { type DataTransformer, jsonDataTransformer } from "../transformers.ts";
import { validate } from "../validate.ts";
import {
	type CommandQueryObject,
	type CommandHeadersObject,
	Command,
} from "./command.ts";

export type SequentialMediaChunk = {
	/**
	 * the chunk's data, before `dataTransformer` decodes it
	 */
	data: string;
};

/**
 * A command with an OpenAPI 3.2 sequential media type for its success body,
 * a stream of items. A subclass for a media type names it and the transformer
 * that splits the body into chunks, each with a `data` string. An item is the
 * chunk with its data decoded
 */
export abstract class SequentialMediaCommand<
	TCommandInput = unknown,
	TCommandOutput = unknown,
	TCommandQuery extends CommandQueryObject = CommandQueryObject,
	TCommandHeaders extends CommandHeadersObject = CommandHeadersObject,
	TItem extends { data: unknown } = { data: TCommandOutput },
> extends Command<TCommandInput, TItem, TCommandQuery, TCommandHeaders> {
	// a type-only brand, so a type can require or exclude a sequential command
	declare readonly "~sequential": true;

	public abstract readonly mediaType: string;

	public readonly dataTransformer: DataTransformer = jsonDataTransformer;

	// validates each chunk's decoded data. Its output may hold an optional
	// member as explicitly undefined
	public readonly dataSchema?: StandardSchemaV1<
		unknown,
		UndefinedOnPartialDeep<TCommandOutput>
	>;

	// items are checked by their data, through dataSchema
	declare public readonly responseSchema?: never;

	// a stream pipes once, so parse() creates a transformer per response
	public abstract readonly createTransformer: () => ReadableWritablePair<
		SequentialMediaChunk,
		Uint8Array<ArrayBuffer>
	>;

	// a Promise when the transformer or the schema is async
	#parseChunk(chunk: SequentialMediaChunk) {
		const transformed = this.dataTransformer(chunk.data);

		const validated = this.dataSchema
			? validate(this.dataSchema, transformed)
			: transformed;

		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- bridges UndefinedOnPartialDeep<TCommandOutput> to TCommandOutput, which the server's contract promises
		return validated as TCommandOutput | Promise<TCommandOutput>;
	}

	/**
	 * Errors the stream with a ResponseValidationError when a chunk's data
	 * fails to decode or validate
	 */
	public parse(bodyStream: ReadableStream<Uint8Array<ArrayBuffer>>, url: URL) {
		return bodyStream.pipeThrough(this.createTransformer()).pipeThrough(
			new TransformStream<SequentialMediaChunk, TItem>({
				transform: async (chunk, controller) => {
					try {
						const data = await this.#parseChunk(chunk);

						// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an item is its chunk with the data decoded
						controller.enqueue({ ...chunk, data } as TItem);
					} catch (err) {
						throw new ResponseValidationError(this, url, err);
					}
				},
			}),
		);
	}
}
