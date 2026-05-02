import type { Simplify } from "type-fest";
import { withNullProto } from "../lib/utils.ts";

// for checking errors thrown
export { ServiceError, PublicValibotHonoError } from "../lib/errors.ts";

// types needed as peer dep for generated clients
export * from "../lib/types.ts";

export { Command } from "../lib/command.ts";

// a good standard/basic fetcher factory
export { createIsomorphicNativeFetcher } from "./fetchers/isomorphic-native-fetcher.ts";

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => (typeof val === "bigint" ? val.toString() : val));
}

export type WithoutUndefinedProperties<T extends object> = Simplify<{
  [P in keyof T]: Exclude<T[P], undefined>;
}>;

export type OptionalToUndefined<T extends object> = {
  [P in keyof T]: undefined extends T[P] ? T[P] | undefined : T[P];
};

// this is a better version that uses Object.fromEntries
export function stripUndefined<T extends object>(obj: OptionalToUndefined<T>) {
  return withNullProto(
    Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v !== "undefined")),
  ) as WithoutUndefinedProperties<T>;
}

// the client
export { RestServiceClient, type RestServiceClientConfig } from "../lib/rest-service-client.ts";
