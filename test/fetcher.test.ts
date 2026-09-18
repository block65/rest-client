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
		const res = await isomorphicFetcher({
			method: "get",
			url: new URL("/200", base),
		});

		expect(res).toMatchSnapshot({
			url: expect.any(URL),
		});
	});

	test("204", async () => {
		const res = await isomorphicFetcher({
			method: "get",
			url: new URL("/204", base),
		});

		expect(res).toMatchSnapshot({
			url: expect.any(URL),
		});
	});

	test("JSON Error", async () => {
		const res = await isomorphicFetcher({
			method: "get",
			url: new URL("/json-error", base),
		});

		expect(res).toMatchSnapshot({
			url: expect.any(URL),
		});
	});

	test("404", async () => {
		const res = await isomorphicFetcher({
			method: "get",
			url: new URL("/404", base),
		});

		expect(res.res.status).toBe(404);

		// body is an unread stream here; snapshotting it captures Node's stream
		// internals, which differ between Node versions
		expect(res).toMatchSnapshot({
			url: expect.any(URL),
			body: expect.any(ReadableStream),
		});
	});

	test("Custom options iso fetcher", async () => {
		const fetcher = createIsomorphicNativeFetcher({
			headers: {
				"x-fetcher": "custom",
			},
		});

		const res = await fetcher({
			method: "get",
			url: new URL("/my-headers", base),
		});

		expect(res).toMatchSnapshot({
			url: expect.any(URL),
		});
	});

	test("a Headers default survives the merge", async () => {
		const fetcher = createIsomorphicNativeFetcher({
			headers: new Headers({ "x-fetcher": "from-headers" }),
		});

		const res = await fetcher({
			method: "get",
			url: new URL("/my-headers", base),
		});

		expect(res.body).toMatchObject({ "x-fetcher": "from-headers" });
	});

	test("an array of pairs survives the merge", async () => {
		const fetcher = createIsomorphicNativeFetcher({
			headers: [["x-fetcher", "from-pairs"]],
		});

		const res = await fetcher({
			method: "get",
			url: new URL("/my-headers", base),
		});

		expect(res.body).toMatchObject({ "x-fetcher": "from-pairs" });
	});

	test("a per-request header overrides a default spelled in another case", async () => {
		const fetcher = createIsomorphicNativeFetcher({
			headers: { "X-Fetcher": "default" },
		});

		const res = await fetcher({
			method: "get",
			url: new URL("/my-headers", base),
			headers: { "x-fetcher": "override" },
		});

		expect(res.body).toMatchObject({ "x-fetcher": "override" });
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

			const res = await fetcher({
				method: "get",
				url: new URL("/json-error", base),
			});

			expect(res.res.status).toBe(400);
			expect(res.body).toMatchObject({ message: "Data should be array" });
		});

		test("transient status retries until success", async () => {
			const fetcher = createIsomorphicNativeFetcher({
				retry: { ...fastRetry, retries: 3 },
			});

			const res = await fetcher({
				method: "get",
				url: new URL("/flaky?key=succeeds&failures=2", base),
			});

			expect(res.res.status).toBe(200);
			expect(res.body).toEqual({ attempt: 3 });
		});

		test("exhausted retries return the final non-ok response", async () => {
			const fetcher = createIsomorphicNativeFetcher({
				retry: { ...fastRetry, retries: 2 },
			});

			const res = await fetcher({
				method: "get",
				url: new URL("/flaky?key=exhausted&failures=99", base),
			});

			expect(res.res.status).toBe(503);
			expect(res.body).toEqual({ attempt: 3 });
		});

		test("non-idempotent methods never retry", async () => {
			const fetcher = createIsomorphicNativeFetcher({
				retry: { ...fastRetry, retries: 5 },
			});

			const res = await fetcher({
				method: "post",
				url: new URL("/flaky?key=post&failures=99", base),
			});

			expect(res.res.status).toBe(503);
			expect(res.body).toEqual({ attempt: 1 });
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

		expect(() => controller.signal.throwIfAborted()).toThrowError(DOMException);
	}, 150);
});
afterAll(() => {
	server.close();
});
