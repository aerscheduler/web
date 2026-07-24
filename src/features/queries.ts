import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Announcement,
  AvailabilityInput,
  CreateInvoiceInput,
  CreateLocationInput,
  CreatePlaneResourceInput,
  CreateReservationInput,
  CurrencyType,
  Invoice,
  InviteInput,
  Location,
  Organization,
  OrganizationBillingSettings,
  OrganizationRating,
  OrganizationUser,
  Reservation,
  Resource,
  RolesUpdate,
  User,
} from "@/types/api";

/** Options accepted by every read hook (currently just React Query's `enabled`). */
export type QueryOpts = { enabled?: boolean };

export type MemberFilter = Partial<
  Record<
    "admin" | "owner" | "instructor" | "student" | "renter" | "dispatcher" | "technician" | "noRoles",
    boolean
  >
>;

// ---------------------------------------------------------------- reads

export function useMembers(filter?: MemberFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["members", filter ?? {}],
    queryFn: () => api<OrganizationUser[]>("/orgUsers", { query: filter }),
    ...opts,
  });
}

export function useOrgUsers(opts?: QueryOpts) {
  return useMembers(undefined, opts);
}

export function useUsers(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
    ...opts,
  });
}

export function usePlanes(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "planes"],
    queryFn: () => api<Resource[]>("/resources/planes"),
    ...opts,
  });
}

export function useResources(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "all"],
    queryFn: () => api<Resource[]>("/resources"),
    ...opts,
  });
}

export function useReservations(startDate: string, endDate: string, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reservations", startDate, endDate],
    queryFn: () =>
      api<Reservation[]>("/reservations", {
        query: { startDate, endDate, orderBy: "asc", includeCanceled: false },
      }),
    ...opts,
  });
}

export function useInvoices(
  filter?: { paid?: boolean; startDate?: string; endDate?: string },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["invoices", filter ?? {}],
    queryFn: () => api<Invoice[]>("/invoices", { query: filter }),
    ...opts,
  });
}

export function useLocations(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["locations"],
    queryFn: () => api<Location[]>("/locations"),
    ...opts,
  });
}

export function useRatings(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["ratings"],
    queryFn: () => api<OrganizationRating[]>("/organizations/ratings"),
    ...opts,
  });
}

export function useCurrencyTypes(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["currencyTypes"],
    queryFn: () => api<CurrencyType[]>("/currencies/types"),
    ...opts,
  });
}

export function useBilling(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => api<OrganizationBillingSettings>("/organizations/billing"),
    ...opts,
  });
}

export function useAnnouncements(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: () => api<Announcement[]>("/announcements"),
    ...opts,
  });
}

// ---------------------------------------------------------------- mutations

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

export function useCreateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      api<Reservation>("/reservations", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useUpdateReservation(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateReservationInput>) =>
      api<Reservation>(`/reservations/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api<void>(`/reservations/${id}`, { method: "DELETE", body: reason ? { reason } : undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

export function useCreatePlane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlaneResourceInput) =>
      api<Resource>("/resources", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useUpdateResource(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<Resource>(`/resources/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useApproveResource(resourceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, approve }: { userId: number; approve: boolean }) =>
      api(`/resources/${resourceId}/${approve ? "approve" : "unapprove"}`, {
        method: "POST",
        body: { userId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useInviteMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteInput) =>
      api<void>("/organizations/invite", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["invitations"] });
    },
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      api<Invoice>("/invoices", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

/** PATCH an invoice — mark paid (`{ paidAt }`), void (`{ voidedAt }`), edit memo. */
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) =>
      api<Invoice>(`/invoices/${id}`, { method: "PATCH", body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
  });
}

// ---------------------------------------------------------------- onboarding / org setup

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLocationInput) =>
      api<Location>("/locations", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

export function useCreateRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; defaultInstructorRate: number; anyInstructorCanTeach?: boolean }) =>
      api<OrganizationRating>("/organizations/ratings", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ratings"] }),
  });
}

export function useUpdateBilling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<OrganizationBillingSettings> & Record<string, unknown>) =>
      api<OrganizationBillingSettings>("/organizations/billing", { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing"] }),
  });
}

export function useCreateCurrencyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; description?: string; gracePeriodDays?: number }) =>
      api<CurrencyType>("/currencies/types", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currencyTypes"] }),
  });
}

export function useUpdateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AvailabilityInput) =>
      api("/users/availability", { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

/** PATCH the current org — used for preferences (e.g. newOrgOnboardingComplete) and org fields. */
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Organization> & Record<string, unknown>) =>
      api<Organization>("/organizations/", { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization"] }),
  });
}

export function useUpdateMemberOrgUser(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api<User>(`/users/${userId}/orgUser`, { method: "PATCH", body: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

/** Create a Stripe connected account → returns onboarding `{ url }`. */
export function useConnectStripe() {
  return useMutation({
    mutationFn: () => api<{ url: string }>("/stripe/account/seller", { method: "POST" }),
  });
}
