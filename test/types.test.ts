import { expectTypeOf, test } from 'vitest';
import {
  GetBillingAccountCommand,
  LinkBillingAccountCommand,
  UpdateBillingAccountCommand,
} from './fixtures/test1/commands.js';
import { BillingServiceRestApiRestClient } from './fixtures/test1/main.js';
import { BillingCountry, type BillingAccount } from './fixtures/test1/types.js';

const fakeApiUrl = new URL('https://192.0.2.1');

const expectedApiReturnValue: Record<string, unknown> = {};

const client = new BillingServiceRestApiRestClient(fakeApiUrl, {
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

test('command that will result in a void response', async () => {
  const result = await client.send(
    new LinkBillingAccountCommand({
      accountId: '1234',
      billingAccountId: '5678',
    }),
  );
  expectTypeOf(result).toMatchTypeOf<never>();
});

test('command without a body', async () => {
  const result = await client.send(
    new GetBillingAccountCommand({
      billingAccountId: '5678',
    }),
  );
  expectTypeOf(result).toMatchTypeOf<BillingAccount>();
});

test('command with a body', async () => {
  const expectedBillingAccountType = await client.send(
    new UpdateBillingAccountCommand({
      billingAccountId: '5678',
      country: BillingCountry.Sg,
    }),
  );
  expectTypeOf(expectedBillingAccountType).toMatchTypeOf<BillingAccount>();
});
