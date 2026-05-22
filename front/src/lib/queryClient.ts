import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: false
    }
  }
});
