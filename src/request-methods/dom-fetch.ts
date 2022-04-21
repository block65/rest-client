/// <reference lib="dom" />

import type { JsonValue } from 'type-fest';
import { CustomErrorSerialized, CustomError } from '@block65/custom-error';
import type { RequestMethod } from '../generated/core/OpenAPI.js';
import {
  hackyConvertDates,
  RequestMethodFactoryOptions,
  resolve,
} from './common.js';
import { ProviderError } from '../../lib/errors.js';
import { stripUndefined, isPlainObject } from '../../lib/utils.js';

export function createDomFetchRequestMethod(
  options?: RequestMethodFactoryOptions & { credentials?: RequestCredentials },
): RequestMethod {
  return async (params, config) => {
    if (params.mediaType && params.mediaType !== 'application/json') {
      throw new Error('mediaType not supported');
    }

    const url = new URL(params.path, config?.BASE);

    new URLSearchParams(stripUndefined(params.query || {})).forEach((v, k) =>
      url.searchParams.set(k, v !== null ? v : ''),
    );

    const res = await fetch(url.toString(), {
      keepalive: options?.keepAlive,
      body: JSON.stringify(params.body),
      method: params.method,
      signal: config?.signal,
      credentials: options?.credentials,
      headers: {
        'content-type': 'application/json;charset=utf-8',
        accept: 'application/json',
        ...(config?.TOKEN && {
          authorization: `Bearer ${await resolve(config.TOKEN, params)}`,
        }),
        ...(config?.HEADERS && (await resolve(config.HEADERS, params))),
      },
    });

    const body: CustomErrorSerialized | JsonValue = await (res.headers
      .get('content-type')
      ?.startsWith('application/json')
      ? res.json()
      : res.text());

    // TODO: Parse out a useful error instance
    if (res.status >= 400) {
      if (isPlainObject(body) && 'code' in body) {
        throw CustomError.fromJSON(body as unknown as CustomErrorSerialized);
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
