import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import getPort from 'get-port';
import { createIsomorphicFetcher } from '../src/main.js';
import { requestListener } from './server.js';

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
    ).toMatchSnapshot({
      url: expect.any(URL),
    });
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
    ).rejects.toMatchSnapshot();
  }, 150);

  afterAll((done) => {
    server.close(done);
  });
});
