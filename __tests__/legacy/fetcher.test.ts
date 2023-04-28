import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { createIsomorphicFetcher } from '../../src/isomorphic-fetch.js';
import { requestListener } from '../server.js';

const server = createServer(requestListener);
const isomorphicFetcher = createIsomorphicFetcher();

describe('Fetcher', () => {
  let base: URL;
  beforeAll(async () => {
    const port = await getPort();
    server.listen(port);
    base = new URL(`http://0.0.0.0:${port}`);
  });

  test('200 OK!', async () => {
    const response = await isomorphicFetcher({
      method: 'get',
      url: new URL('/200', base),
    });

    expect(response).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": [
          1,
          2,
          3,
        ],
        "ok": true,
        "status": 200,
        "statusText": "OK",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('204', async () => {
    const response = await isomorphicFetcher({
      method: 'get',
      url: new URL('/204', base),
    });

    expect(response).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": "",
        "ok": true,
        "status": 204,
        "statusText": "No Content",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('JSON Error', async () => {
    expect(
      await isomorphicFetcher({
        method: 'get',
        url: new URL('/json-error', base),
      }),
    ).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": {
          "code": 9,
          "message": "Data should be array",
          "status": "FAILED_PRECONDITION",
        },
        "ok": false,
        "status": 400,
        "statusText": "Bad Request",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('404', async () => {
    expect(
      await isomorphicFetcher({
        method: 'get',
        url: new URL('/404', base),
      }),
    ).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": "<h1>Not Found</h1>",
        "ok": false,
        "status": 404,
        "statusText": "Not Found",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('Custom options iso fetcher', async () => {
    const customOptionsFetcher = createIsomorphicFetcher({
      headers: {
        'x-fetcher': 'custom',
      },
    });

    expect(
      await customOptionsFetcher({
        method: 'get',
        url: new URL('/my-headers', base),
      }),
    ).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": {
          "accept": "*/*",
          "accept-encoding": "gzip, deflate, br",
          "connection": "close",
          "host": "redacted",
          "user-agent": "node-fetch",
          "x-fetcher": "custom",
        },
        "ok": true,
        "status": 200,
        "statusText": "OK",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('Custom timeout iso fetcher', async () => {
    const customTimeoutFetcher = createIsomorphicFetcher({
      timeout: 100,
    });

    await expect(
      customTimeoutFetcher({
        method: 'get',
        url: new URL('/unresponsive', base),
      }),
    ).rejects.toMatchInlineSnapshot(
      // eslint-disable-next-line quotes
      `[TimeoutError: Request timed out]`,
    );
  }, 150);

  afterAll((done) => {
    server.close(done);
  });
});
