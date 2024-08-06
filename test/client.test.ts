/* eslint-disable max-classes-per-file */
import { createServer } from 'node:http';
import getPort from 'get-port';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  Command,
  RestServiceClient,
  createIsomorphicNativeFetcher,
} from '../src/main.js';
import { requestListener } from './server.js';

const port = await getPort();
const server = createServer(requestListener);

const fetcher = createIsomorphicNativeFetcher();

class Fake200Command extends Command {
  public override method = 'get' as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_body?: Record<string, unknown>) {
    super('/200');
  }
}

// 404
class Fake404Command extends Command {
  public override method = 'get' as const;

  constructor() {
    super('/404');
  }
}

// json-error
class FakeJsonErrorCommand extends Command {
  public override method = 'get' as const;

  constructor() {
    super('/json-error');
  }
}

type HeadersOutput = Record<string, string>;

type Outputs = undefined | HeadersOutput;
type Inputs = never;

// my headers
class FakeMyHeadersCommand extends Command<Inputs, HeadersOutput> {
  public override method = 'get' as const;

  constructor() {
    super('/my-headers');
  }
}

describe('Client', () => {
  const client = new RestServiceClient<Inputs, Outputs>(
    new URL(`http://0.0.0.0:${port}`),
    {
      fetcher,
      headers: {
        'x-build-id': 'test/123',
        'x-async': () => Promise.resolve('Bearer 1234567890'),
        'x-func': () => 'hello',
      },
    },
  );

  beforeAll(() => {
    server.listen(port);
  });

  test('200 OK!', async () => {
    const response = await client.json(
      new Fake200Command({
        hello: true,
      }),
    );

    expect(response).toMatchSnapshot();
  });

  test('404', async () => {
    await expect(client.json(new Fake404Command())).rejects.toMatchSnapshot();
  });

  test('JSON Error', async () => {
    await expect(
      client.json(new FakeJsonErrorCommand()),
    ).rejects.toThrowErrorMatchingSnapshot('"Data should be array"');
  });

  test('Headers', async () => {
    const command = new FakeMyHeadersCommand();
    const response = await client.json(command, {
      headers: {
        'x-merged': 'hello',
      },
    });

    expect(response).toMatchSnapshot();
  });
});

afterAll(() => {
  server.close();
});
