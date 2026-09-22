import { stripUndefined } from "@block65/rest-client";
import type { UndefinedOnPartialDeep } from "type-fest";
import { expect, expectTypeOf, test } from "vitest";
import { RestServiceClient } from "../lib/client.ts";
import { Command } from "../lib/command.ts";

const fakeApiUrl = new URL("https://192.0.2.1");

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

// the deep-widened shape stripUndefined leaves behind, as Command sees it
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
	// A generated client destructures an UndefinedOnPartialDeep input into
	// super(), so nested members arrive widened with `| undefined` while the
	// query type spells them exact-optional. stripUndefined clears the top
	// level alone, leaving Command to accept the widened shape

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
