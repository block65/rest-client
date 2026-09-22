import type { Simplify } from "type-fest";

// for checking errors thrown
export {
	PublicValidationError,
	ResponseValidationError,
	ServiceError,
} from "../lib/errors.ts";

// types needed as peer dep for generated clients
export * from "../lib/types.ts";

export { Command } from "../lib/command.ts";

// a good standard/basic fetcher factory
export { createIsomorphicNativeFetcher } from "./fetchers/isomorphic-native-fetcher.ts";

export { jsonStringify } from "../lib/utils.ts";

// the query serializers a command can pick from, and the encoders a
// generated command names per parameter
export { createQueryStringSerializer } from "../lib/query/query-string.ts";
export {
	createQuerySerializer,
	defaultQuerySerializer,
} from "../lib/query/serializer.ts";
export { encodeDeepObject } from "../lib/query/deep-object.ts";
export { encodeFormExploded } from "../lib/query/form-exploded.ts";
export { encodeFormJoined } from "../lib/query/form-joined.ts";
export { encodePipeDelimited } from "../lib/query/pipe-delimited.ts";
export { encodeSpaceDelimited } from "../lib/query/space-delimited.ts";

export type WithoutUndefinedProperties<T extends object> = Simplify<{
	[P in keyof T]: Exclude<T[P], undefined>;
}>;

export type OptionalToUndefined<T extends object> = {
	[P in keyof T]: undefined extends T[P] ? T[P] | undefined : T[P];
};

export function stripUndefined<T extends object>(obj: OptionalToUndefined<T>) {
	const kept = Object.entries(obj).filter(([, v]) => v !== undefined);

	// fromEntries returns an index signature, never the mapped type
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- by design
	return Object.fromEntries(kept) as WithoutUndefinedProperties<T>;
}

// the client
export {
	RestServiceClient,
	type RestServiceClientConfig,
} from "../lib/client.ts";
