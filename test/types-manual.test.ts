/* eslint-disable max-classes-per-file */
import { expectTypeOf, test } from "vitest";
import { Command } from "../lib/command.ts";
import { RestServiceClient } from "../lib/rest-service-client.ts";

const fakeApiUrl = new URL("https://192.0.2.1");
// const expectedApiReturnValue = undefined;

type RandomBody = { data: 888 };
type RandomParams = { something: "heehee" };
type RandomInput = RandomParams & RandomBody;
type RandomOutput = { output: 123 };

type AllInputs = RandomInput;
type AllOutputs = RandomOutput;

class RandomClient extends RestServiceClient<AllInputs, AllOutputs> { }

const client = new RandomClient(fakeApiUrl, {
	fetcher: async () => ({
		url: fakeApiUrl,
		res: new Response(null, {
			status: 200,
		headers: new Headers({
			"x-is-fake": "yep",
		})
		}),
		// json: expectedApiReturnValue,
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
