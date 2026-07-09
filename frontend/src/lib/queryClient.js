import { QueryClient } from '@tanstack/react-query'

// Shared QueryClient for the app. Defaults tuned for a discovery feed:
// data stays fresh for a minute, no refetch-on-focus thrash, one retry.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
