import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiList } from "@/lib/api";
import type { PagingState } from "@/lib/paging";
import type {
  BookingOffering,
  BookingOfferingInput,
  OrganizationCalendarVisibility,
} from "@/types/booking-offerings";

export function useBookingOfferingsPage(paging: PagingState, enabled = true) {
  return useQuery({
    queryKey: ["booking-offerings", paging.query],
    enabled,
    queryFn: async () => {
      const { data, pagination } = await apiList<BookingOffering>("/booking-offerings", {
        query: paging.query as Record<string, string | number | boolean | undefined>,
      });
      return { rows: data, total: pagination.total, hasMore: pagination.hasMore };
    },
    placeholderData: (prev) => prev,
  });
}

export function useBookingOffering(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ["booking-offerings", id],
    enabled: enabled && id != null,
    queryFn: () => api<BookingOffering>(`/booking-offerings/${id}`),
  });
}

export function useCreateBookingOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BookingOfferingInput) =>
      api<BookingOffering>("/booking-offerings", { method: "POST", body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["booking-offerings"] });
    },
  });
}

export function useUpdateBookingOffering() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: BookingOfferingInput & { id: number }) =>
      api<BookingOffering>(`/booking-offerings/${id}`, { method: "PATCH", body: input }),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["booking-offerings"] });
      void queryClient.invalidateQueries({ queryKey: ["booking-offerings", vars.id] });
    },
  });
}

export function useCalendarVisibility(enabled = true) {
  return useQuery({
    queryKey: ["calendar-visibility"],
    enabled,
    queryFn: () => api<OrganizationCalendarVisibility>("/booking-offerings/visibility"),
    staleTime: 60_000,
  });
}

export function useUpdateCalendarVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<OrganizationCalendarVisibility>) =>
      api<OrganizationCalendarVisibility>("/booking-offerings/visibility", {
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-visibility"] });
    },
  });
}
