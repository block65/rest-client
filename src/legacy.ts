// for checking errors thrown
export { ServiceError } from '../lib/errors.js';

// types needed as peer dep for generated clients
export * from '../lib/types.js';

// a good standard/basic fetcher factory
export { createIsomorphicFetcher } from './isomorphic-fetch.js';

export { type RestServiceClientConfig } from '../lib/rest-service-client.js';

// the client
export {
  /** @deprecated */
  LegacyRestServiceClient as RestServiceClient,
} from '../lib/legacy-rest-service-client.js';
