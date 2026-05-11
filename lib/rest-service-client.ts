import type { Jsonifiable } from "type-fest";
import type { GenericSchema } from "valibot";
import { createIsomorphicNativeFetcher } from "../src/fetchers/isomorphic-native-fetcher.ts";
import type { Command } from "./command.ts";
import { resolveHeaders } from "./common.ts";
import { ServiceError } from "./errors.ts";
import type {
  FetcherMethod,
  JsonifiableObject,
  ResolvableHeaders,
  RuntimeOptions,
} from "./types.ts";

type ValibotModule = typeof import("valibot");

let valibotPromise: Promise<ValibotModule | null> | undefined;

function loadValibot(): Promise<ValibotModule | null> {
  if (!valibotPromise) {
    valibotPromise = import("valibot").catch(() => null);
  }
  return valibotPromise;
}

function isValibotSchema(value: unknown): value is GenericSchema {
  return typeof value === "object" && value !== null && "kind" in value && "~standard" in value;
}

function getCommandResponseSchema(command: object): GenericSchema | undefined {
  const ctor = command.constructor;
  if ("responseSchema" in ctor && isValibotSchema(ctor.responseSchema)) {
    return ctor.responseSchema;
  }
  return undefined;
}

export type RestServiceClientConfig = {
  logger?: ((msg: string, ...args: unknown[]) => void) | undefined;
  headers?: ResolvableHeaders | undefined;
  credentials?: "include" | "omit" | "same-origin" | undefined;
} & ({ fetcher?: FetcherMethod } | { fetch?: typeof globalThis.fetch });

export class RestServiceClient<
  // WARN: this must be kept compatible with the Command Input and Output types
  ClientInput extends JsonifiableObject | unknown = unknown,
  ClientOutput extends Jsonifiable | unknown = unknown,
> {
  readonly #base: URL;

  readonly #fetcher: FetcherMethod;

  readonly #headers: ResolvableHeaders | undefined;

  #logger: RestServiceClientConfig["logger"];

  constructor(base: URL | string, config: RestServiceClientConfig = {}) {
    this.#base = new URL(base);
    this.#headers = Object.freeze(config.headers);

    this.#logger = config.logger;

    this.#fetcher =
      "fetcher" in config
        ? config.fetcher
        : createIsomorphicNativeFetcher(
            "fetch" in config
              ? {
                  fetch: config.fetch,
                }
              : {},
          );
  }

  #log(msg: string, ...args: unknown[]) {
    this.#logger?.(`[rest-client] ${msg}`, ...args);
  }

  // Schema presence on the Command is the sole validation trigger — consumers
  // opt in by importing from the codegen's validated commands file (or via a
  // bundler alias in dev). Lean imports skip schema attachment, valibot never
  // loads, no bundle cost.
  async #maybeValidate(command: object, body: unknown): Promise<unknown> {
    const schema = getCommandResponseSchema(command);
    if (!schema) {
      return body;
    }
    const valibot = await loadValibot();
    if (!valibot) {
      return body;
    }
    return valibot.parse(schema, body);
  }

  public async response<InputType extends ClientInput, OutputType extends ClientOutput>(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ) {
    const { method, pathname, query } = command;

    const defaultUrl = new URL(`.${pathname}`, this.#base);
    defaultUrl.search = query
      ? new URLSearchParams(
          Object.entries(query).map(([k, v]): [string, string] => [k, v?.toString() ?? ""]),
        ).toString()
      : "";

    const url = runtimeOptions?.url
      ? new URL(await runtimeOptions.url(defaultUrl))
      : defaultUrl;

    this.#log("req: %s %s", method.toUpperCase(), url, runtimeOptions);

    const result = await this.#fetcher({
      url,
      method,

      ...(command.body && {
        body: command.body,
      }),

      headers: await resolveHeaders({
        ...this.#headers,
        ...command.headers,
        ...runtimeOptions?.headers,
      }),
      ...(runtimeOptions?.signal && { signal: runtimeOptions?.signal }),
    });

    this.#log(
      "res: %d %s %s %s",
      result.res.status,
      result.res.statusText,
      result.res.headers.get("content-type") || "-",
      result.res.headers.get("content-length") || "-",
    );

    return result;
  }

  public async json<InputType extends ClientInput, OutputType extends ClientOutput>(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    const { res, body } = await this.response(command, {
      ...runtimeOptions,
      headers: {
        accept: "application/json",
        ...runtimeOptions?.headers,
        "content-type": "application/json;charset=utf-8",
      },
    });

    if (res.status < 400) {
      return (await this.#maybeValidate(command, body)) as OutputType;
    }

    throw ServiceError.fromResponse(res, body);
  }

  public async send<InputType extends ClientInput, OutputType extends ClientOutput>(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<OutputType> {
    const { res, body } = await this.response(command, runtimeOptions);

    if (res.status < 400) {
      return (await this.#maybeValidate(command, body)) as OutputType;
    }

    throw ServiceError.fromResponse(res, body);
  }

  // public API for streaming responses
  // fallow-ignore-next-line unused-class-member
  public async stream<InputType extends ClientInput, OutputType extends ClientOutput>(
    command: Command<InputType, OutputType>,
    runtimeOptions?: RuntimeOptions,
  ): Promise<ReadableStream<OutputType>> {
    const { body } = await this.response(command, runtimeOptions);

    if (body instanceof ReadableStream) {
      return body as ReadableStream<OutputType>;
    }

    return new ReadableStream<OutputType>({
      start(controller) {
        controller.enqueue(body as OutputType);
        controller.close();
      },
    });
  }
}
