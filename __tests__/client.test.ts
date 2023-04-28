/* eslint-disable max-classes-per-file */
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import {
  Command,
  RestServiceClient,
  createIsomorphicFetcher,
} from '../src/main.js';
import { requestListener } from './server.js';

const port = await getPort();
const server = createServer(requestListener);

const isomorphicFetcher = createIsomorphicFetcher();

class Fake200Command extends Command {
  public override method = 'get' as const;

  constructor() {
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
type Outputs = void | HeadersOutput;
type Inputs = void;

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
    isomorphicFetcher,
    {
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
    const response = await client.send(new Fake200Command());

    expect(response).toMatchInlineSnapshot(`
      [
        1,
        2,
        3,
      ]
    `);
  });

  test('404', async () => {
    await expect(
      client.send(new Fake404Command()),
    ).rejects.toMatchInlineSnapshot(
      // eslint-disable-next-line quotes
      `[Error: Not Found]`,
    );
  });

  test('JSON Error', async () => {
    await expect(
      client.send(new FakeJsonErrorCommand()),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      // eslint-disable-next-line quotes
      `"Data should be array"`,
    );
  });

  test('Headers', async () => {
    const command = new FakeMyHeadersCommand();
    const response = await client.send(command, {
      headers: {
        'x-merged': 'hello',
      },
    });

    expect(response).toMatchInlineSnapshot(`
      {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br",
        "connection": "close",
        "host": "redacted",
        "user-agent": "node-fetch",
        "x-async": "Bearer 1234567890",
        "x-build-id": "test/123",
        "x-func": "hello",
        "x-merged": "hello",
      }
    `);
  });

  afterAll((done) => {
    server.close(done);
  });
});
