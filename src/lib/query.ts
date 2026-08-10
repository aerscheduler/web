import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

/**
 * Retrying an auth / permission / not-found failure never helps, the second
 * answer is the same as the first. Worse, on an expired session it doubles
 * every 401 and delays the sign-out the user is waiting to be told about.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      refetchOnWindowFocus: false,
    },
  },
});
