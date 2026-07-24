import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Invoice,
  OrganizationUser,
  Reservation,
  Resource,
  RolesUpdate,
  User,
} from "@/types/api";

export type MemberFilter = Partial<
  Record<
    "admin" | "owner" | "instructor" | "student" | "renter" | "dispatcher" | "technician" | "noRoles",
    boolean
  >
>;

export function useMembers(filter?: MemberFilter) {
  return useQuery({
    queryKey: ["members", filter ?? {}],
    queryFn: () => api<OrganizationUser[]>("/orgUsers", { query: filter }),
  });
}

export function useOrgUsers() {
  return useMembers();
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
  });
}

export function usePlanes() {
  return useQuery({
    queryKey: ["resources", "planes"],
    queryFn: () => api<Resource[]>("/resources/planes"),
  });
}

export function useResources() {
  return useQuery({
    queryKey: ["resources", "all"],
    queryFn: () => api<Resource[]>("/resources"),
  });
}

export function useReservations(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["reservations", startDate, endDate],
    queryFn: () =>
      api<Reservation[]>("/reservations", {
        query: { startDate, endDate, orderBy: "asc", includeCanceled: false },
      }),
  });
}

export function useInvoices(opts?: { paid?: boolean; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ["invoices", opts ?? {}],
    queryFn: () => api<Invoice[]>("/invoices", { query: opts }),
  });
}

export function useUpdateRoles(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roles: RolesUpdate) =>
      api<User>(`/users/${userId}/roles`, { method: "PATCH", body: roles }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
