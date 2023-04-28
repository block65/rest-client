// for checking errors thrown
export { ServiceError } from '../lib/errors.js';

// for building your own fetcher/fetcher factory
export type {
  /** @deprecated */
  LegacyFetcherMethod as FetcherMethod,
  /** @deprecated */
  LegacyFetcherResponse as FetcherResponse,
  FetcherParams,
} from '../lib/fetcher.js';

// types needed as peer dep for generated clients
export * from '../lib/types.js';

// a good standard/basic fetcher factory
export { createIsomorphicFetcher } from './isomorphic-fetch.js';

// client
export {
  /** @deprecated */
  LegacyRestServiceClient as RestServiceClient,
} from '../lib/legacy-rest-service-client.js';
