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
- `client.stream(command)` — returns the response body as a `ReadableStream<Uint8Array>`, unparsed whatever its content type. Throws `ServiceError` on `>=400`.

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

### Query parameter styles

A command names the serializer for the OpenAPI `style` and `explode` its document states, from a set of five that write one style each. They are plain functions created once, so a module of a thousand generated commands shares the same five. A command that names nothing writes `form` with `explode`, the OpenAPI default for a query parameter:

```ts
import { deepObjectSerializer } from "@block65/rest-client";

class ListAuditLogsCommand extends Command<Input, Output, Query> {
	public override querySerializer = deepObjectSerializer;
}
```

| Serializer                 | style            | explode | `["blue", "black"]`      | `{ R: 100, G: 200 }`                |
| -------------------------- | ---------------- | ------- | ------------------------ | ----------------------------------- |
| `formExplodeSerializer`    | `form`           | true    | `color=blue&color=black` | `R=100&G=200`                       |
| `formJoinSerializer`       | `form`           | false   | `color=blue,black`       | `color=R,100,G,200`                 |
| `spaceDelimitedSerializer` | `spaceDelimited` | false   | `color=blue%20black`     | `color=R%20100%20G%20200`           |
| `pipeDelimitedSerializer`  | `pipeDelimited`  | false   | `color=blue%7Cblack`     | `color=R%7C100%7CG%7C200`           |
| `deepObjectSerializer`     | `deepObject`     |         | `color=blue&color=black` | `color%5BR%5D=100&color%5BG%5D=200` |

Every name and value is percent-encoded once, outside RFC 3986's unreserved set, so `url.search` returns exactly what was written. A `null` is the spec's undefined value and writes `color=`, an `undefined` parameter is absent, and a value with `toJSON` is written as `JSON.stringify` would show it. The spec leaves a nested array or object undefined for every style, so one throws.

### Sorted query keys

Every serializer writes keys in the order the query object was built. `sortQuery` orders them first, by UTF-8 byte order or by a comparator, so a cache or a signature keyed on the URL sees one URL per query:

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
