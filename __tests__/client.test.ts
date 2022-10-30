import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { RestServiceClient } from '../lib/rest-service-client.js';
import { isomorphicFetcher } from '../src/isomorphic-fetch.js';
import { requestListener } from './server.js';

const server = createServer(requestListener);

const port = await getPort();

describe('Client', () => {
  const client = new RestServiceClient(
    new URL(`http://0.0.0.0:${port}`),
    isomorphicFetcher,
    {
      headers: {
        'x-build-id': 'test/123',
      },
    },
  );

  beforeAll(() => {
    server.listen(port);
  });

  test('200 OK!', async () => {
    const response = await client.send((requestMethod, options) =>
      requestMethod(
        {
          method: 'get',
          pathname: '/200',
        },
        options,
      ),
    );

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
      client.send((requestMethod, options) =>
        requestMethod(
          {
            method: 'get',
            pathname: '/404',
          },

          options,
        ),
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot(
      '"Unexpected token < in JSON at position 0"',
    );
  });

  test('JSON Error', async () => {
    await expect(
      client.send((requestMethod, options) =>
        requestMethod(
          {
            method: 'get',
            pathname: '/json-error',
          },

          options,
        ),
      ),
    ).rejects.toThrowErrorMatchingInlineSnapshot('"Bad Request"');
  });

  afterAll((done) => {
    server.close(done);
  });
});
