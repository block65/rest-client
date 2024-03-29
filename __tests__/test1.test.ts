/* eslint-disable no-console */
import { test, expect } from '@jest/globals';
import type { Jsonifiable } from 'type-fest';
import type { JsonifiableObject } from 'type-fest/source/jsonifiable.js';
import type { Command } from '../src/main.js';
import {
  GetBillingAccountCommand,
  LinkBillingAccountCommand,
  UpdateBillingAccountCommand,
} from './fixtures/test1/commands.js';
import { BillingCountry } from './fixtures/test1/types.js';

async function thisAlwaysThrows<
  CommandInput extends JsonifiableObject | void = void,
  CommandOutput extends Jsonifiable | void = void,
  CommandBody extends Jsonifiable | void = void,
  CommandQuery extends JsonifiableObject | void = void,
>(
  _: Command<CommandInput, CommandOutput, CommandBody, CommandQuery>,
): Promise<CommandOutput> {
  if (process.pid) {
    throw new Error('You can ignore this safely');
  }

  return { _ } as unknown as CommandOutput;
}

test('command that will result in a void response', async () => {
  const command = new LinkBillingAccountCommand({
    accountId: '1234',
    billingAccountId: '5678',
  });

  try {
    const resultForTypeChecks = await thisAlwaysThrows(command);
    expect(resultForTypeChecks).toBe(undefined);
  } catch (err) {
    // console.log(Object(err).message);
  }
});

test('command without a body', async () => {
  const command = new GetBillingAccountCommand({
    billingAccountId: '5678',
  });

  try {
    const resultForTypeChecks = await thisAlwaysThrows(command);
    expect(typeof resultForTypeChecks.billingAccountId).toBe('string');
  } catch (err) {
    // console.debug(Object(err).message);
  }
});

test('command with a body', async () => {
  const command = new UpdateBillingAccountCommand({
    billingAccountId: '5678',
    country: BillingCountry.Sg,
  });

  try {
    const resultForTypeChecks = await thisAlwaysThrows(command);
    expect(typeof resultForTypeChecks.billingAccountId).toBe('string');
  } catch (err) {
    // console.debug(Object(err).message);
  }
});
