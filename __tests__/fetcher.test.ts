import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { isomorphicFetcher } from '../src/isomorphic-fetch.js';
import { requestListener } from './server.js';

const server = createServer(requestListener);

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

  test('Headers', async () => {
    const response = await isomorphicFetcher({
      method: 'get',
      url: new URL('/my-headers', base),
      headers: {
        'x-async': () => Promise.resolve('Bearer 1234567890'),
        'x-func': () => 'hello',
        'x-primitive': 'hello',
      },
    });

    expect(response).toMatchInlineSnapshot(
      {
        url: expect.any(URL),
      },
      `
      {
        "body": {
          "accept": "*/*",
          "accept-encoding": "gzip, deflate",
          "accept-language": "*",
          "connection": "keep-alive",
          "host": "redacted",
          "sec-fetch-mode": "cors",
          "user-agent": "undici",
          "x-async": "Bearer 1234567890",
          "x-func": "hello",
          "x-primitive": "hello",
        },
        "ok": true,
        "status": 200,
        "statusText": "OK",
        "url": Any<URL>,
      }
    `,
    );
  });

  test('JSON Error', async () => {
    const response = await isomorphicFetcher({
      method: 'get',
      url: new URL('/json-error', base),
    });

    // expect(CustomError.isCustomError(response)).toBeTruthy();
    expect(response).toMatchInlineSnapshot(
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
    await expect(
      isomorphicFetcher({
        method: 'get',
        url: new URL('/404', base),
      }),
    ).rejects.toMatchInlineSnapshot(
      '[SyntaxError: Unexpected token < in JSON at position 0]',
    );
  });

  afterAll((done) => {
    server.close(done);
  });
});
