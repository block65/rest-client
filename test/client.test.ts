/* eslint-disable max-classes-per-file */
import { createServer } from "node:http";
import getPort from "get-port";
import { afterAll, assert, beforeAll, describe, expect, test } from "vitest";
import { Command, RestServiceClient, ServiceError, createIsomorphicNativeFetcher } from "../src/main.ts";
import { requestListener } from "./server.ts";

const port = await getPort();
const server = createServer(requestListener);

const fetcher = createIsomorphicNativeFetcher();

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

type Outputs = FakeMyHeadersOutput | Fake404CommandOutput | Fake200CommandOutput;

type Inputs = never;

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
});

afterAll(() => {
  server.close();
});
