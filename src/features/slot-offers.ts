import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  CreateDeskSlotOfferInput,
  CreateStandbyInterestInput,
  SlotOffer,
  StandbyInterest,
} from "@/types/slot-offers";

export function useMyStandbyInterest() {
  return useQuery({
    queryKey: ["standby", "me"],
    queryFn: () => api<StandbyInterest[]>("/standby/me"),
  });
}

export function useReservationStandby(reservationId: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["standby", "reservation", reservationId],
    queryFn: () =>
      api<StandbyInterest[]>("/standby", {
        query: { reservationId },
      }),
    enabled: enabled && reservationId != null,
  });
}

export function useCreateStandbyInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateStandbyInterestInput) =>
      api<StandbyInterest>("/standby", { method: "POST", body: input }),
    onSuccess: (interest) => {
      void queryClient.invalidateQueries({ queryKey: ["standby", "me"] });
      void queryClient.invalidateQueries({
        queryKey: ["standby", "reservation", interest.watchedReservation?.id],
      });
    },
  });
}

export function useWithdrawStandbyInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<StandbyInterest>(`/standby/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["standby"] });
    },
  });
}

export function useMySlotOffers() {
  return useQuery({
    queryKey: ["slot-offers", "me"],
    queryFn: () => api<SlotOffer[]>("/slot-offers/me"),
    refetchInterval: 30_000,
  });
}

export function usePendingSlotOffers(enabled = true) {
  return useQuery({
    queryKey: ["slot-offers", "pending"],
    queryFn: () => api<SlotOffer[]>("/slot-offers"),
    enabled,
    refetchInterval: 30_000,
  });
}

function useSlotOfferTransition(action: "accept" | "decline" | "withdraw") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<SlotOffer>(`/slot-offers/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slot-offers"] });
      if (action === "accept") {
        void queryClient.invalidateQueries({ queryKey: ["reservations"] });
      }
    },
  });
}

export function useAcceptSlotOffer() {
  return useSlotOfferTransition("accept");
}

export function useDeclineSlotOffer() {
  return useSlotOfferTransition("decline");
}

export function useWithdrawSlotOffer() {
  return useSlotOfferTransition("withdraw");
}

export function useCreateSlotOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeskSlotOfferInput) =>
      api<SlotOffer | null>("/slot-offers", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slot-offers"] });
    },
  });
}
