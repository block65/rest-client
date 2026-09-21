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

// the query serializers a command can pick from
export {
	createQueryStringSerializer,
	defaultQuerySerializer,
} from "../lib/query-serializer.ts";

export type WithoutUndefinedProperties<T extends object> = Simplify<{
	[P in keyof T]: Exclude<T[P], undefined>;
}>;

export type OptionalToUndefined<T extends object> = {
	[P in keyof T]: undefined extends T[P] ? T[P] | undefined : T[P];
};

export function stripUndefined<T extends object>(obj: OptionalToUndefined<T>) {
	// TYPESAFETY: fromEntries types its result as an index signature
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fromEntries returns an index signature, never the mapped type
	return Object.fromEntries(
		Object.entries(obj).filter(([, v]) => v !== undefined),
	) as WithoutUndefinedProperties<T>;
}

// the client
export {
	RestServiceClient,
	type RestServiceClientConfig,
} from "../lib/client.ts";
