// for checking errors thrown
export { ServiceError } from '../lib/errors.js';

// for building your own fetcher
export { hackyConvertDates } from '../lib/common.js';

// a good standard/basic fetcher
export { isomorphicFetcher } from '../src/isomorphic-fetch.js';

// the client
export {
  RestServiceClient,
  type RestServiceClientConfig,
} from '../lib/rest-service-client.js';
