// @ts-ignore
import type { ApiRequestOptions } from './ApiRequestOptions.js';
// @ts-ignore
import type { ApiResult } from './ApiResult.js';
// @ts-ignore
import type { Config } from './OpenAPI.js';

/**
 * Request using fetch client
 * @param {ApiRequestOptions} options The request options from the service
 * @param {Config} [localConfig] Runtime overrides for the specific API request
 * @returns {ApiResult}
 * @throws {ApiError}
 */
export async function request(
  options: ApiRequestOptions,
  localConfig?: Config,
): Promise<ApiResult> {
  if (!localConfig) {
    throw new Error('Empty localConfig');
  }
  return localConfig.REQUEST(options, localConfig);
}
