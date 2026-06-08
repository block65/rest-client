/// <reference types="node" />
import { createServer } from "node:http";
import getPort from "get-port";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createIsomorphicNativeFetcher } from "../src/main.ts";
import { requestListener } from "./server.ts";

const server = createServer(requestListener);
const isomorphicFetcher = createIsomorphicNativeFetcher();

describe("Fetcher", () => {
  let base: URL;
  beforeAll(async () => {
    const port = await getPort();
    server.listen(port);
    base = new URL(`http://0.0.0.0:${port}`);
  });

  test("200 OK!", async () => {
    const response = await isomorphicFetcher({
      method: "get",
      url: new URL("/200", base),
    });

    expect(response).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test("204", async () => {
    const response = await isomorphicFetcher({
      method: "get",
      url: new URL("/204", base),
    });

    expect(response).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test("JSON Error", async () => {
    expect(
      await isomorphicFetcher({
        method: "get",
        url: new URL("/json-error", base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test("404", async () => {
    expect(
      await isomorphicFetcher({
        method: "get",
        url: new URL("/404", base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test("Custom options iso fetcher", async () => {
    const fetcher = createIsomorphicNativeFetcher({
      headers: {
        "x-fetcher": "custom",
      },
    });

    expect(
      await fetcher({
        method: "get",
        url: new URL("/my-headers", base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test("Custom timeout iso fetcher", async () => {
    const fetcher = createIsomorphicNativeFetcher({
      timeout: 100,
    });

    const err = await fetcher({
      method: "get",
      url: new URL("/unresponsive", base),
    }).catch((e) => e);

    expect(err).toBeInstanceOf(DOMException);
    expect(err.code).toBe(DOMException.TIMEOUT_ERR);
  }, 150);

  describe("retry semantics", () => {
    const fastRetry = { minTimeout: 1, maxTimeout: 5 };

    test("non-ok response returns even with retry config present", async () => {
      const fetcher = createIsomorphicNativeFetcher({
        retry: { ...fastRetry, retries: 0 },
      });

      const response = await fetcher({
        method: "get",
        url: new URL("/json-error", base),
      });

      expect(response.res.status).toBe(400);
      expect(response.body).toMatchObject({ message: "Data should be array" });
    });

    test("transient status retries until success", async () => {
      const fetcher = createIsomorphicNativeFetcher({
        retry: { ...fastRetry, retries: 3 },
      });

      const response = await fetcher({
        method: "get",
        url: new URL("/flaky?key=succeeds&failures=2", base),
      });

      expect(response.res.status).toBe(200);
      expect(response.body).toEqual({ attempt: 3 });
    });

    test("exhausted retries return the final non-ok response", async () => {
      const fetcher = createIsomorphicNativeFetcher({
        retry: { ...fastRetry, retries: 2 },
      });

      const response = await fetcher({
        method: "get",
        url: new URL("/flaky?key=exhausted&failures=99", base),
      });

      expect(response.res.status).toBe(503);
      expect(response.body).toEqual({ attempt: 3 });
    });

    test("non-idempotent methods never retry", async () => {
      const fetcher = createIsomorphicNativeFetcher({
        retry: { ...fastRetry, retries: 5 },
      });

      const response = await fetcher({
        method: "post",
        url: new URL("/flaky?key=post&failures=99", base),
      });

      expect(response.res.status).toBe(503);
      expect(response.body).toEqual({ attempt: 1 });
    });
  });

  test("User abort iso fetcher", async () => {
    const fetcher = createIsomorphicNativeFetcher({
      timeout: 100,
    });

    const controller = new AbortController();

    setTimeout(() => controller.abort(), 100);

    const err = await fetcher({
      method: "get",
      url: new URL("/unresponsive", base),
      signal: controller.signal,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(DOMException);
    expect(err.code).toBe(DOMException.ABORT_ERR);

    expect(controller.signal.throwIfAborted).toThrowError();
  }, 150);
});
afterAll(() => {
  server.close();
});
