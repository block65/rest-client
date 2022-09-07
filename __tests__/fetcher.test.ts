import { createServer } from 'node:http';
import type { CustomErrorSerialized } from '@block65/custom-error';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
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
