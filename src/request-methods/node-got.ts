import got from 'got';
import { Agent } from 'https';
import { ProviderError as ApiError } from '../../lib/errors.js';
import { isPlainObject, stripUndefined } from '../../lib/utils.js';
import { RequestMethod } from '../generated/core/OpenAPI.js';
import {
  hackyConvertDates,
  RequestMethodFactoryOptions,
  resolve,
} from './common.js';

export function createGotRequestMethod(
  options?: RequestMethodFactoryOptions,
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

    const gotPomise = got(url.toString(), {
      agent: {
        https: agent,
      },
      json: params.body,
      method: params.method,
      headers: {
        ...(config?.TOKEN && {
          authorization: `Bearer ${await resolve(config.TOKEN, params)}`,
        }),
        ...(config?.HEADERS && (await resolve(config.HEADERS, params))),
      },
      timeout: {
        request: 30000, // cold start for serverless fns
      },
      throwHttpErrors: false,
    });

    if (config?.signal) {
      config?.signal.addEventListener('abort', () => {
        gotPomise.cancel();
      });
      if (config?.signal.aborted) {
        gotPomise.cancel();
      }
    }

    const res = await gotPomise;

    const body: string = res.headers['content-type']?.startsWith(
      'application/json',
    )
      ? JSON.parse(res.body)
      : res.body;

    const ok = res.statusCode >= 400;
    // TODO: Parse out a useful error instance
    if (res.statusCode >= 400) {
      if (
        // hopefully a CustomErrorSerialized
        isPlainObject(body) &&
        typeof body.status === 'string' &&
        typeof body.message === 'string'
      ) {
        throw new ApiError(body.message || body.status).debug({ body });
      }
      throw new ApiError(res.statusMessage || `HTTP ${res.statusCode}`).debug({
        ok,
        body,
      });
    }

    return {
      body: hackyConvertDates(body),
      url: res.url,
      status: res.statusCode,
      statusText: res.statusMessage || res.statusCode.toString(),
      ok,
    };
  };
}
