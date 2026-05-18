# @block65/rest-client

Lightweight REST client for Block65 services. Pairs with [`@block65/openapi-codegen`](https://github.com/block65/openapi-codegen), which generates `Command` classes that this client knows how to dispatch.

Runs in Node and browsers — uses platform `globalThis.fetch` and standard Web APIs (`Request`, `Response`, `ReadableStream`, `AbortController`).

## Install

```sh
pnpm add @block65/rest-client
```

`valibot` is an optional peer dependency — install it only if you opt in to response validation:

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
new RestServiceClient(url, { fetcher: createIsomorphicNativeFetcher({ retry: { retries: 5 } }) });
```

The default fetcher retries idempotent (`GET`) requests and supports timeouts and merged abort signals.

### Response validation via `responseSchema`

When a generated command class exposes a static `responseSchema` (a [valibot](https://valibot.dev) schema), the client automatically runs the schema against successful responses — useful for coercing JSON-unsafe types like `int64` strings into `BigInt`.

Schema presence on the command is the sole trigger; there is no client-level flag. Consumers opt in by importing from the codegen's validated commands file (lean imports skip schema attachment, so `valibot` never loads and there's no bundle cost).

```ts
import { RestServiceClient } from "@block65/rest-client";

const client = new RestServiceClient(url, { fetcher });

// GetAccountCommand.responseSchema coerces { id: "123" } → { id: 123n }
const account = await client.json(new GetAccountCommand());
account.id; // bigint
```

If `valibot` isn't installed at runtime, validation is silently skipped. Validation failures throw `ResponseValidationError`.

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
