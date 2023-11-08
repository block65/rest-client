import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import {
  RestServiceClient,
  createIsomorphicFetcher,
} from '../../src/legacy.js';
import { requestListener } from '../server.js';

const port = await getPort();
const server = createServer(requestListener);

const isomorphicFetcher = createIsomorphicFetcher();

describe('Client', () => {
  const client = new RestServiceClient(
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
    const response = await client.send((requestMethod, options) =>
      requestMethod(
        {
          method: 'get',
          pathname: '/200',
        },
        options,
      ),
    );

    expect(response).toMatchSnapshot();
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
    ).rejects.toMatchSnapshot();
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
    ).rejects.toThrowErrorMatchingInlineSnapshot('"Data should be array"');
  });

  test('Headers', async () => {
    const response = await client.send((requestMethod, options) =>
      requestMethod(
        {
          pathname: '/my-headers',
          method: 'get',
          headers: {
            'x-merged': 'hello',
          },
        },
        options,
      ),
    );

    expect(response).toMatchSnapshot();
  });

  afterAll((done) => {
    server.close(done);
  });
});
