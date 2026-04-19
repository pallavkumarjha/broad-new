// Centralised React Query client for the app.
//
// Why a shared singleton (not per-screen):
//   - Lets any screen observe a query another screen owns (e.g. Home and Trips
//     both read /trips — one fetch, both render).
//   - Lets us invalidate across screens in one line after a mutation
//     (queryClient.invalidateQueries({ queryKey: ['trips'] })).
//
// Defaults are tuned for a cold-start-prone Railway backend:
//   - staleTime 30s: a tab-switch within 30s re-uses the cache and shows data
//     instantly. That was the single worst part of the prior UX — blank screen
//     + spinner every time you hopped tabs.
//   - gcTime 5min: don't evict too eagerly, unused queries still help return
//     visits feel instant.
//   - retry: 1 only for GETs. Mutations never auto-retry — our POSTs can be
//     side-effectful (request-to-join, approve) and a silent retry can double-
//     submit. Caller decides.
//   - refetchOnWindowFocus false: RN doesn't have a real window-focus event
//     anyway, and we drive revalidation via refetchOnMount + focus-based
//     useQuery remounts in the tab screens.
//
// NOTE: We still call api.ts under the hood — the refresh-token interceptor
// and 45s timeout all apply to every React Query fetch.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s — tab-switch within this window = 0 network
      gcTime: 5 * 60_000,       // 5min — keep caches warm across navigation
      retry: 1,                 // one retry on transient failures
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,                 // never auto-retry mutations — avoid duplicate POSTs
    },
  },
});
