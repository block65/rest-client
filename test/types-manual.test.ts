import type { UndefinedOnPartialDeep } from "type-fest";
import { expect, expectTypeOf, test } from "vitest";
import { Command } from "../lib/command.ts";
import { RestServiceClient } from "../lib/rest-service-client.ts";
import { stripUndefined } from "../src/main.ts";

const fakeApiUrl = new URL("https://192.0.2.1");

// const expectedApiReturnValue = undefined;

type RandomBody = { data: 888 };
type RandomParams = { something: "heehee" };
type RandomInput = RandomParams & RandomBody;
type RandomOutput = { output: 123 };

type AllInputs = RandomInput;
type AllOutputs = RandomOutput;

class RandomClient extends RestServiceClient<AllInputs, AllOutputs> {}

const client = new RandomClient(fakeApiUrl, {
	fetcher: async () => ({
		url: fakeApiUrl,
		res: new Response(null, {
			status: 200,
			headers: new Headers({
				"x-is-fake": "yep",
			}),
		}),
		// json: expectedApiReturnValue
	}),
});

class RandomCommand extends Command<RandomInput, RandomOutput, RandomBody> {
	public override method = "put" as const;

	constructor(input: RandomInput) {
		const { something, ...body } = input;
		super(`/somewhere/${something}`, JSON.stringify(body));
	}
}

test("manual command", async () => {
	const result = await client.send(
		new RandomCommand({
			something: "heehee",
			data: 888,
		}),
	);
	expectTypeOf(result).toMatchTypeOf<RandomOutput>();
});

// Generated clients take an UndefinedOnPartialDeep input and hand the
// destructured members straight to super(), so a deepObject parameter arrives
// with `| undefined` on its nested members while the query type spells them
// exact-optional. stripUndefined only clears the top level, so Command has to
// accept the deep-widened shape or this stops compiling
type DeepObjectQuery = {
	effective_at?: { gt?: `${number}`; lte?: `${number}` };
	project_ids?: readonly string[];
	limit?: `${number}`;
};

class DeepObjectQueryCommand extends Command<
	UndefinedOnPartialDeep<DeepObjectQuery>,
	RandomOutput,
	DeepObjectQuery
> {
	public override method = "get" as const;

	constructor(input?: UndefinedOnPartialDeep<DeepObjectQuery>) {
		const { effective_at, project_ids, limit } = input ?? {};
		super(
			"/organization/audit_logs",
			null,
			stripUndefined({ effective_at, project_ids, limit }),
		);
	}
}

test("command with a nested query object", () => {
	const command = new DeepObjectQueryCommand({
		effective_at: { gt: "1", lte: undefined },
		limit: undefined,
	});

	// top level stripped, nested left alone
	expect(command.query).toStrictEqual({
		effective_at: { gt: "1", lte: undefined },
	});
});

test("stripUndefined hands back non-plain values untouched", () => {
	const blob = new Blob(["hi"]);
	const url = new URL("https://192.0.2.1/x");
	const list = ["a", "b"];
	const nested = { gt: "1", lte: undefined };

	const result = stripUndefined({ blob, url, list, nested, gone: undefined });

	expect(result.blob).toBe(blob);
	expect(result.url).toBe(url);
	expect(result.list).toBe(list);
	expect(result.nested).toBe(nested);
	expect(result).not.toHaveProperty("gone");
});
