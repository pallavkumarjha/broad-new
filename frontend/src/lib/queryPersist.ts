// Disk persistence for the React Query cache.
//
// On cold start we hydrate cached query data from AsyncStorage so the first
// frame of Trips / Discover / Trip Detail can render before a single network
// request fires. React Query then revalidates in the background — staleTime
// from queryClient.ts controls whether that revalidation actually fetches.
//
// We bump `buster` whenever the response schema changes so old payloads
// (e.g. trips before planned_end_date existed) get purged on app upgrade.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'broad-rq-cache-v1',
  throttleTime: 1000,
});

// Bump this string to invalidate all persisted caches on next launch.
// Tie it to the trip schema (planned_end_date added).
export const PERSIST_BUSTER = 'schema-2026-05-13';

// Max age — anything older than 24h is treated as expired and dropped.
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;
