/* eslint-disable max-classes-per-file */
import { expectTypeOf, test } from 'vitest';
import { Command } from '../lib/command.js';
import { RestServiceClient } from '../lib/rest-service-client.js';

const fakeApiUrl = new URL('https://192.0.2.1');
const expectedApiReturnValue = undefined;

type RandomBody = { data: 888 };
type RandomParams = { something: 'heehee' };
type RandomInput = RandomParams & RandomBody;
type RandomOutput = { output: 123 };

type AllInputs = RandomInput;
type AllOutputs = RandomOutput;

export class RandomClient extends RestServiceClient<AllInputs, AllOutputs> {}

const client = new RandomClient(fakeApiUrl, {
  fetcher: async () => ({
    status: 200,
    ok: true,
    statusText: 'OK',
    url: fakeApiUrl,
    headers: new Headers({
      'x-is-fake': 'yep',
    }),
    json: expectedApiReturnValue,
  }),
});

class RandomCommand extends Command<RandomInput, RandomOutput, RandomBody> {
  public override method = 'put' as const;

  constructor(input: RandomInput) {
    const { something, ...body } = input;
    super(`/somewhere/${something}`, body);
  }
}
test('manual command', async () => {
  const result = await client.send(
    new RandomCommand({
      something: 'heehee',
      data: 888,
    }),
  );
  expectTypeOf(result).toMatchTypeOf<RandomOutput>();
});
