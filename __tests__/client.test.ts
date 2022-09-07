import { createServer } from 'node:http';
import type { CustomErrorSerialized } from '@block65/custom-error';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { RestServiceClient } from '../lib/rest-service-client.js';
import { isomorphicFetcher } from '../src/isomorphic-fetch.js';

const server = createServer((req, res) => {
  switch (req.url) {
    case '/200':
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([1, 2, 3]));
      break;
    case '/json-error':
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          message: 'Data should be array',
          code: 9,
          status: 'FAILED_PRECONDITION',
        } as CustomErrorSerialized),
      );
      break;
    default:
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not Found</h1>');
      break;
  }
});

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
