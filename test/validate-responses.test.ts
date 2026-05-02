import type { Jsonifiable } from "type-fest";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { Command, RestServiceClient, jsonStringify } from "../src/main.ts";

const fakeUrl = new URL("https://192.0.2.1");

const billingAccountSchema = v.object({
  id: v.pipe(
    v.string(),
    v.transform((s) => BigInt(s)),
  ),
  name: v.string(),
});

type BillingAccount = v.InferOutput<typeof billingAccountSchema>;

class GetAccountCommand extends Command<unknown, BillingAccount> {
  public override method = "get" as const;

  static responseSchema = billingAccountSchema;

  constructor() {
    super("/account");
  }
}

class GetAccountUnvalidatedCommand extends Command<unknown, { id: string; name: string }> {
  public override method = "get" as const;

  constructor() {
    super("/account");
  }
}

function makeFetcher(body: Jsonifiable) {
  return async () => ({
    url: fakeUrl,
    body,
    res: new Response(null, {
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/json" }),
    }),
  });
}

describe("jsonStringify", () => {
  test("serializes BigInt values to strings", () => {
    expect(jsonStringify({ amount: BigInt(123) })).toBe('{"amount":"123"}');
  });

  test("serializes nested BigInt values", () => {
    expect(jsonStringify({ a: [BigInt(1), BigInt(2)], b: { c: BigInt(3) } })).toBe(
      '{"a":["1","2"],"b":{"c":"3"}}',
    );
  });

  test("passes through non-BigInt values unchanged", () => {
    expect(jsonStringify({ s: "hi", n: 1, b: true, nul: null })).toBe(
      '{"s":"hi","n":1,"b":true,"nul":null}',
    );
  });

  test("handles top-level BigInt", () => {
    expect(jsonStringify(BigInt(42))).toBe('"42"');
  });
});

describe("validateResponses", () => {
  test("parses response through static responseSchema when enabled", async () => {
    const client = new RestServiceClient(fakeUrl, {
      fetcher: makeFetcher({ id: "123", name: "Alice" }),
      validateResponses: true,
    });

    const result = await client.json(new GetAccountCommand());

    expect(result.id).toBe(BigInt(123));
    expect(result.name).toBe("Alice");
  });

  test("passes body through unchanged when validateResponses is false (default)", async () => {
    const client = new RestServiceClient(fakeUrl, {
      fetcher: makeFetcher({ id: "123", name: "Alice" }),
    });

    const result = await client.json(new GetAccountCommand());

    expect(result.id).toBe("123");
    expect(result.name).toBe("Alice");
  });

  test("passes body through unchanged when command has no responseSchema", async () => {
    const client = new RestServiceClient(fakeUrl, {
      fetcher: makeFetcher({ id: "123", name: "Alice" }),
      validateResponses: true,
    });

    const result = await client.json(new GetAccountUnvalidatedCommand());

    expect(result.id).toBe("123");
    expect(result.name).toBe("Alice");
  });

  test("throws on schema mismatch when validateResponses is enabled", async () => {
    const client = new RestServiceClient(fakeUrl, {
      fetcher: makeFetcher({ id: 123, name: "Alice" }),
      validateResponses: true,
    });

    await expect(client.json(new GetAccountCommand())).rejects.toThrow();
  });

  test("also validates send() responses", async () => {
    const client = new RestServiceClient(fakeUrl, {
      fetcher: makeFetcher({ id: "123", name: "Alice" }),
      validateResponses: true,
    });

    const result = await client.send(new GetAccountCommand());

    expect(result.id).toBe(BigInt(123));
  });
});
