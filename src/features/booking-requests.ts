import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  ApproveBookingRequestInput,
  BookingRequest,
  CreateBookingRequestInput,
} from "@/types/booking-requests";

export function useMyBookingApprovalPolicy() {
  return useQuery({
    queryKey: ["booking-requests", "policy", "me"],
    queryFn: () => api<{ requiresApproval: boolean }>("/booking-requests/policy/me"),
    staleTime: 60_000,
  });
}

export function useMyBookingRequests(enabled = true) {
  return useQuery({
    queryKey: ["booking-requests", "me"],
    queryFn: () => api<BookingRequest[]>("/booking-requests/me"),
    enabled,
    refetchInterval: 30_000,
  });
}

export function usePendingBookingRequests(enabled = true) {
  return useQuery({
    queryKey: ["booking-requests", "pending"],
    queryFn: () => api<BookingRequest[]>("/booking-requests"),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useCreateBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingRequestInput) =>
      api<BookingRequest>("/booking-requests", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
    },
  });
}

function useBookingRequestTransition(
  action: "approve" | "reject" | "cancel",
  body?: (reason?: string) => Record<string, unknown> | undefined
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api<BookingRequest>(`/booking-requests/${id}/${action}`, {
        method: "POST",
        body: body?.(reason),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      if (action === "approve") {
        void queryClient.invalidateQueries({ queryKey: ["reservations"] });
        void queryClient.invalidateQueries({ queryKey: ["availability"] });
      }
    },
  });
}

export function useApproveBookingRequest() {
  return useBookingRequestTransition("approve");
}

export function useApproveBookingRequestWithBody() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ApproveBookingRequestInput }) =>
      api<BookingRequest>(`/booking-requests/${id}/approve`, { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useRejectBookingRequest() {
  return useBookingRequestTransition("reject", (reason) =>
    reason ? { reason } : undefined
  );
}

export function useCancelBookingRequest() {
  return useBookingRequestTransition("cancel");
}
