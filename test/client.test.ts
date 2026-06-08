/* eslint-disable max-classes-per-file */
import { createServer } from "node:http";
import getPort from "get-port";
import type { JsonValue, UndefinedOnPartialDeep } from "type-fest";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import { Command, RestServiceClient, ServiceError, createIsomorphicNativeFetcher } from "../src/main.ts";
import { requestListener } from "./server.ts";

const port = await getPort();
const server = createServer(requestListener);

// fast retry backoff so the 5xx tests exercise real retries without real delays
const fetcher = createIsomorphicNativeFetcher({ retry: { minTimeout: 1, maxTimeout: 5 } });

type Fake200CommandInput = {
  hello: boolean;
};
type Fake200CommandOutput = unknown;

class Fake200Command extends Command<Fake200CommandInput, Fake200CommandOutput> {
  public override method = "get" as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_body: Fake200CommandInput) {
    super("/200");
  }
}

type Fake404CommandInput = never;
type Fake404CommandOutput = never;

// 404
class Fake404Command extends Command<Fake404CommandInput, Fake404CommandOutput> {
  public override method = "get" as const;

  constructor() {
    super("/404");
  }
}

// 500
class Fake500Command extends Command {
  public override method = "get" as const;

  constructor() {
    super("/500");
  }
}

// json-error
class FakeJsonErrorCommand extends Command {
  public override method = "get" as const;

  constructor() {
    super("/json-error");
  }
}

type FakeMyHeadersOutput = Record<string, string>;

// Fake500Command/FakeJsonErrorCommand extend Command with default `unknown`
// inputs/outputs, so the test client has to accept those too.
type Outputs = unknown;

type Inputs = unknown;

// fake headers
class FakeMyHeadersCommand extends Command<never, FakeMyHeadersOutput> {
  public override method = "get" as const;

  constructor() {
    super("/my-headers");
  }
}

describe("Client", () => {
  const client = new RestServiceClient<Inputs, Outputs>(new URL(`http://0.0.0.0:${port}`), {
    fetcher,
    headers: {
      "x-build-id": "test/123",
      "x-async": () => Promise.resolve("Bearer 1234567890"),
      "x-func": () => "hello",
    },
  });

  beforeAll(() => {
    server.listen(port);
  });

  test("200 OK!", async () => {
    const response = await client.json(
      new Fake200Command({
        hello: true,
      }),
    );

    expect(response).toMatchSnapshot();
  });

  test("404", async () => {
    await expect(client.json(new Fake404Command())).rejects.toMatchSnapshot();
  });

  test("500", async () => {
    await expect(client.json(new Fake500Command())).rejects.toMatchSnapshot();
  });

  test("JSON Error", async () => {
    await expect(client.json(new FakeJsonErrorCommand())).rejects.toThrowErrorMatchingSnapshot(
      '"Data should be array"',
    );
  });

  test("Headers", async () => {
    const command = new FakeMyHeadersCommand();
    const response = await client.json(command, {
      headers: {
        "x-merged": "hello",
      },
    });

    expect(response).toMatchSnapshot();
  });

  test("runtime accept header overrides json() default", async () => {
    const command = new FakeMyHeadersCommand();
    const response = await client.json(command, {
      headers: {
        accept: "application/vnd.custom+json",
      },
    });

    assert(response && typeof response === "object" && "accept" in response);
    expect(response.accept).toBe("application/vnd.custom+json");
  });

  test("JSON error attaches response to thrown ServiceError", async () => {
    const err = await client.json(new FakeJsonErrorCommand()).catch((e: unknown) => e);

    assert(err instanceof ServiceError);
    expect(err.response).toBeInstanceOf(Response);
    expect(err.response.status).toBe(400);
  });

  describe("runtimeOptions.url", () => {
    type EchoOutput = {
      method: string;
      pathname: string;
      search: string;
      query: Record<string, string>;
    };

    class EchoCommand extends Command<never, EchoOutput, { foo?: string }> {
      public override method = "get" as const;

      constructor(query?: { foo?: string }) {
        super("/200", null, query);
      }
    }

    test("function receives default-built URL; return value is fetched as-is (presigned-style takeover)", async () => {
      const command = new EchoCommand({ foo: "bar" });

      let received: URL | undefined;
      const response = await client.json<never, EchoOutput>(command, {
        url: (u) => {
          received = u;
          const next = new URL(`http://0.0.0.0:${port}/echo`);
          next.searchParams.set("signed", "xyz");
          return next;
        },
      });

      assert(received);
      expect(received.pathname).toBe("/200");
      expect(received.searchParams.get("foo")).toBe("bar");
      expect(response.pathname).toBe("/echo");
      expect(response.query).toStrictEqual({ signed: "xyz" });
    });

    test("function may be async and return a string", async () => {
      const command = new EchoCommand();

      const response = await client.json<never, EchoOutput>(command, {
        url: async () => {
          await Promise.resolve();
          return `http://0.0.0.0:${port}/echo?from=string`;
        },
      });

      expect(response.query).toStrictEqual({ from: "string" });
    });
  });

  describe("query string building", () => {
    type Query = UndefinedOnPartialDeep<{ [k in string]?: JsonValue }>;

    async function captureUrl(query: Query): Promise<URL> {
      class QueryCommand extends Command<never, unknown, Query> {
        public override method = "get" as const;
        constructor(q: Query) {
          super("/200", null, q);
        }
      }

      let received: URL | undefined;
      await client.json(new QueryCommand(query), {
        url: (u) => {
          received = u;
          return new URL(`http://0.0.0.0:${port}/200`);
        },
      });
      assert(received);
      return received;
    }

    function expected(entries: [string, string][]): string {
      return new URLSearchParams(entries).toString();
    }

    test("array values become repeated keys (OpenAPI form/explode default)", async () => {
      const url = await captureUrl({ tags: ["cat", "dog"] });
      expect(url.search).toBe(`?${expected([["tags", "cat"], ["tags", "dog"]])}`);
    });

    test("null values are omitted entirely", async () => {
      const url = await captureUrl({ a: null, c: "keep" });
      expect(url.search).toBe(`?${expected([["c", "keep"]])}`);
    });

    test("null inside arrays is skipped per-item", async () => {
      const url = await captureUrl({ tags: ["cat", null, "dog"] });
      expect(url.search).toBe(`?${expected([["tags", "cat"], ["tags", "dog"]])}`);
    });

    test("undefined values are omitted entirely (not stringified as 'undefined')", async () => {
      const url = await captureUrl({ a: undefined, c: "keep" });
      expect(url.search).toBe(`?${expected([["c", "keep"]])}`);
    });

    test("scalar values stringify as before", async () => {
      const url = await captureUrl({ id: 42, flag: true, name: "alice" });
      expect(url.search).toBe(
        `?${expected([["id", "42"], ["flag", "true"], ["name", "alice"]])}`,
      );
    });
  });
});

afterAll(() => {
  server.close();
});
