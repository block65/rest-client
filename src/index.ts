// for checking errors thrown
export { ServiceError } from '../lib/errors.js';

// for building your own fetcher/fetcher factory
export type { FetcherMethod } from '../lib/fetcher.js';

// a good standard/basic fetcher factory
export { createIsomorphicFetcher } from '../src/isomorphic-fetch.js';

// the client
export {
  RestServiceClient,
  type RestServiceClientConfig,
} from '../lib/rest-service-client.js';
