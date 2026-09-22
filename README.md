# @block65/rest-client

Lightweight REST client for Block65 services. Pairs with [`@block65/openapi-codegen`](https://github.com/block65/openapi-codegen), which generates `Command` classes that this client knows how to dispatch.

Runs in Node and browsers — uses platform `globalThis.fetch` and standard Web APIs (`Request`, `Response`, `ReadableStream`, `AbortController`).

## Install

```sh
pnpm add @block65/rest-client
```

Response validation runs on any [Standard Schema](https://standardschema.dev) validator. `valibot` is an optional peer dependency — install it, or another spec-compliant validator, only if you opt in:

```sh
pnpm add valibot
```

## Usage

```ts
import { RestServiceClient } from "@block65/rest-client";
import { GetAccountCommand } from "./generated/commands.ts";

const client = new RestServiceClient("https://api.example.com", {
	headers: {
		"x-build-id": "abc123",
		authorization: () => Promise.resolve(`Bearer ${await getToken()}`),
	},
});

const account = await client.json(new GetAccountCommand({ accountId: "1234" }));
```

## Capabilities

### Three response shapes

- `client.json(command)` — sets `content-type: application/json`, returns the parsed body. Throws `ServiceError` on `>=400`.
- `client.send(command)` — same as above but inherits the command's content type.
- `client.stream(command)` — returns a `ReadableStream<Uint8Array>` for non-JSON / streaming responses.

### Resolvable headers

Header values can be functions or async functions, resolved per-request:

```ts
new RestServiceClient(url, {
	headers: {
		authorization: async () => `Bearer ${await refreshToken()}`,
	},
});
```

### Custom fetcher

Swap the underlying fetch implementation, or replace the whole fetcher pipeline:

```ts
new RestServiceClient(url, { fetch: customFetch });
new RestServiceClient(url, {
	fetcher: createIsomorphicNativeFetcher({ retry: { retries: 5 } }),
});
```

The default fetcher retries idempotent (`GET`) requests and supports timeouts and merged abort signals.

### Query encoders

A generated command names an encoder for each parameter whose OpenAPI document departs from the default of `form` with `explode`. Every other parameter takes the fallback, `encodeFormExploded` unless the second argument says otherwise:

```ts
public override querySerializer = createQuerySerializer({
	changes: encodeFormJoined,
	filter: encodeDeepObject,
});
```

The encoders are `encodeFormExploded`, `encodeFormJoined`, `encodeSpaceDelimited`, `encodePipeDelimited` and `encodeDeepObject`, one module each, so a bundle carries only the ones a client's commands name. `createQueryStringSerializer` remains for a server the OpenAPI styles cannot describe.

### Sorted query keys

Both serializers write keys in the order the query object was built. `sortQuery` orders them first, by UTF-8 byte order or by a comparator, so a cache or a signature keyed on the URL sees one URL per query:

```ts
new RestServiceClient(url, { sortQuery: true });
new RestServiceClient(url, { sortQuery: (a, b) => a.localeCompare(b) });
```

### Response validation via `responseSchema`

When a generated command class exposes a static `responseSchema` (any [Standard Schema](https://standardschema.dev) validator, such as [valibot](https://valibot.dev)), the client automatically runs the schema against successful responses — useful for coercing JSON-unsafe types like `int64` strings into `BigInt`.

Schema presence on the command is the sole trigger; there is no client-level flag. Consumers opt in by importing from the codegen's validated commands file (lean imports skip schema attachment, so no validator loads and there's no bundle cost).

```ts
import { RestServiceClient } from "@block65/rest-client";

const client = new RestServiceClient(url, { fetcher });

// GetAccountCommand.responseSchema coerces { id: "123" } → { id: 123n }
const account = await client.json(new GetAccountCommand());
account.id; // bigint
```

Commands without a `responseSchema` pass the body through untouched. Validation failures throw `ResponseValidationError`, carrying the command, the url, and the schema's issues.

### `BigInt`-aware `jsonStringify`

Exported helper that serializes `BigInt` values as strings (since JSON has no native bigint):

```ts
import { jsonStringify } from "@block65/rest-client";

jsonStringify({ amount: 123n });
// '{"amount":"123"}'
```

This closes the int64 round-trip when paired with a coerced response schema:

```
server → "123"   (JSON string)
client → 123n    (after responseSchema parse)
client → "123"   (jsonStringify back to wire)
```

## Errors

```ts
import { ResponseValidationError, ServiceError } from "@block65/rest-client";

try {
	await client.json(cmd);
} catch (err) {
	if (err instanceof ServiceError) {
		err.code; // status code from @block65/custom-error
		err.response; // original Response
	}
}
```

## License

MIT
