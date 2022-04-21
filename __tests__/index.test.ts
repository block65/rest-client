import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { createServer } from 'http';
import { Config } from '../src/generated/core/OpenAPI.js';
import { request } from '../src/generated/core/request.js';
import { createNodeFetchRequestMethod } from '../src/request-methods/node-fetch.js';

const server = createServer(async (req, res) => {
  switch (req.url) {
    case '/200':
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([1, 2, 3]));
      break;
    case '/json-error':
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          message: 'Data Should be array',
          statusCode: 3,
        }),
      );
      break;
    default:
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not Found</h1>');
      break;
  }
});

describe('Node', () => {
  let localConfig: Config | undefined;
  const requestMethod = createNodeFetchRequestMethod();

  beforeAll(async () => {
    const port = await getPort();
    server.listen(port);
    localConfig = {
      VERSION: '1',
      BASE: new URL(`http://0.0.0.0:${port}`),
      REQUEST: requestMethod,
    };
  });

  test('200 OK!', async () => {
    const response = await request(
      {
        method: 'GET',
        path: '/200',
        mediaType: 'application/json',
      },
      localConfig,
    );

    expect(response).toMatchInlineSnapshot(
      {
        url: expect.any(String),
      },
      `
      Object {
        "body": Array [
          1,
          2,
          3,
        ],
        "ok": true,
        "status": 200,
        "statusText": "OK",
        "url": Any<String>,
      }
    `,
    );
  });

  test('JSON Error', async () => {
    const response = await request(
      {
        method: 'GET',
        path: '/json-error',
        mediaType: 'application/json',
      },

      localConfig,
    ).catch((err) => err);

    expect(response).toMatchInlineSnapshot(`[Error: Bad Request]`);
  });

  test('404', async () => {
    await expect(
      request(
        {
          method: 'GET',
          path: '/404',
          mediaType: 'application/json',
        },

        localConfig,
      ),
    ).rejects.toMatchInlineSnapshot(`[Error: Not Found]`);
  });

  afterAll((done) => {
    server.close(done);
  });
});
