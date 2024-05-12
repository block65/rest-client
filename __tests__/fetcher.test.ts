import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { createIsomorphicNativeFetcher } from '../src/main.js';
import { requestListener } from './server.js';

const server = createServer(requestListener);
const isomorphicFetcher = createIsomorphicNativeFetcher();

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

    expect(response).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test('204', async () => {
    const response = await isomorphicFetcher({
      method: 'get',
      url: new URL('/204', base),
    });

    expect(response).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test('200 empty content ala AWS lambda function URL', async () => {
    const response = await isomorphicFetcher({
      method: 'delete',
      url: new URL('/aws-lambda-200', base),
    });

    expect(response).toMatchSnapshot({
      body: '', // 200 so its empty string
      url: expect.any(URL),
    });
  });

  //same but 204
  test('204 empty content ala AWS lambda function URL', async () => {
    const response = await isomorphicFetcher({
      method: 'delete',
      url: new URL('/aws-lambda-204', base),
    });

    expect(response).toMatchSnapshot({
      body: null, // 204 so its null
      url: expect.any(URL),
    });
  });

  test('JSON Error', async () => {
    expect(
      await isomorphicFetcher({
        method: 'get',
        url: new URL('/json-error', base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test('404', async () => {
    expect(
      await isomorphicFetcher({
        method: 'get',
        url: new URL('/404', base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test('Custom options iso fetcher', async () => {
    const fetcher = createIsomorphicNativeFetcher({
      headers: {
        'x-fetcher': 'custom',
      },
    });

    expect(
      await fetcher({
        method: 'get',
        url: new URL('/my-headers', base),
      }),
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
  });

  test('Custom timeout iso fetcher', async () => {
    const fetcher = createIsomorphicNativeFetcher({
      timeout: 100,
    });

    const err = await fetcher({
      method: 'get',
      url: new URL('/unresponsive', base),
    }).catch((e) => e);

    expect(err).toBeInstanceOf(DOMException);
    expect(err.code).toBe(DOMException.TIMEOUT_ERR);
  }, 150);

  test('User abort iso fetcher', async () => {
    const fetcher = createIsomorphicNativeFetcher({
      timeout: 100,
    });

    const controller = new AbortController();

    setTimeout(() => controller.abort(), 100);

    const err = await fetcher({
      method: 'get',
      url: new URL('/unresponsive', base),
      signal: controller.signal,
    }).catch((e) => e);

    expect(err).toBeInstanceOf(DOMException);
    expect(err.code).toBe(DOMException.ABORT_ERR);

    expect(controller.signal.throwIfAborted).toThrowError();
  }, 150);

  afterAll((done) => {
    server.close(done);
  });
});
