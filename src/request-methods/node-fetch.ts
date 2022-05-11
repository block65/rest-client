import { Agent } from 'https';
import fetch from 'node-fetch';
import { ProviderError } from '../../lib/errors.js';
import {
  hackyConvertDates,
  RequestMethodFactoryOptions,
  resolve,
} from './common.js';
import { RequestMethod } from '../generated/core/OpenAPI.js';
import { isPlainObject, stripUndefined } from '../../lib/utils.js';

export function createNodeFetchRequestMethod(
  options: RequestMethodFactoryOptions = {},
): RequestMethod {
  const agent = options?.keepAlive
    ? new Agent({ keepAlive: options?.keepAlive })
    : undefined;

  return async (params, config) => {
    if (params.mediaType && params.mediaType !== 'application/json') {
      throw new Error('mediaType not supported');
    }

    const url = new URL(params.path, config?.BASE as URL);

    new URLSearchParams(stripUndefined(params.query || {})).forEach((v, k) =>
      url.searchParams.set(k, v !== null ? v : ''),
    );

    const { signal, TOKEN, HEADERS } = config || {};

    const res = await fetch(url.toString(), {
      body: JSON.stringify(params.body),
      method: params.method,
      headers: {
        'content-type': 'application/json;charset=utf-8',
        accept: 'application/json',
        ...(TOKEN && {
          authorization: `Bearer ${await resolve(TOKEN, params)}`,
        }),
        ...(HEADERS && (await resolve(HEADERS, params))),
      },
      ...(agent && { agent }),
      ...(signal && { signal }),
    });

    const body = await (res.headers
      .get('content-type')
      ?.startsWith('application/json')
      ? res.json()
      : res.text());

    // TODO: Parse out a useful error instance
    if (res.status >= 400) {
      if (
        isPlainObject(body) &&
        typeof body.name === 'string' &&
        typeof body.message === 'string'
      ) {
        throw new ProviderError(body.message || body.name);
      }
      throw new ProviderError(res.statusText);
    }

    return {
      body: hackyConvertDates(body),
      url: res.url,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
    };
  };
}
