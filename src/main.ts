// for checking errors thrown
export { ServiceError } from '../lib/errors.js';

// types needed as peer dep for generated clients
export * from '../lib/types.js';

export { Command } from '../lib/command.js';

// a good standard/basic fetcher factory
export { createIsomorphicNativeFetcher } from './fetchers/isomorphic-native-fetch.js';

// the client
export {
  RestServiceClient,
  type RestServiceClientConfig,
} from '../lib/rest-service-client.js';
