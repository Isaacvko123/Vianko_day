import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/http";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: false
    }
  }
});
