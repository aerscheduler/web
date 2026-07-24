import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Announcement,
  AppNotification,
  AvailabilityInput,
  CreateInvoiceInput,
  CreateLocationInput,
  ConfirmReviewInput,
  CreatePlaneResourceInput,
  CreateReservationInput,
  ConfirmReviewGuestInput,
  Currency,
  CurrencyType,
  Invoice,
  InvoicePaymentIntent,
  InviteInput,
  Location,
  OrgUserBillingSettings,
  PaymentMethod,
  SetupIntentResponse,
  MaintenanceReminder,
  Organization,
  OrganizationBillingSettings,
  OrganizationRating,
  OrganizationUser,
  RampInInput,
  RampOutInput,
  Reservation,
  Resource,
  RolesUpdate,
  Squawk,
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

/**
 * The stored invoice for a single reservation (`GET /invoices/reservation/:id`).
 * 404s when the reservation hasn't been invoiced, so only enable it once you know
 * an invoice exists (e.g. the close-out flow reached the `invoiced` step).
 */
export function useReservationInvoice(reservationId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["invoices", "reservation", reservationId],
    queryFn: () => api<Invoice>(`/invoices/reservation/${reservationId}`),
    enabled: (opts?.enabled ?? true) && reservationId != null,
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

/**
 * Ramp a reservation out — records the starting Hobbs/tach and marks the aircraft off the ramp.
 * `POST /reservations/:id/rampOut` with `{ hobbsTimeOut, tachTimeOut, comments? }`.
 */
export function useRampOut(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RampOutInput) =>
      api<Reservation>(`/reservations/${id}/rampOut`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/**
 * Ramp a reservation in — records the ending Hobbs/tach (+ optional instruction time) and
 * marks the aircraft back on the ramp. `POST /reservations/:id/rampIn` with
 * `{ hobbsTimeIn, tachTimeIn, briefing?, comments? }`.
 */
export function useRampIn(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RampInInput) =>
      api<Reservation>(`/reservations/${id}/rampIn`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/**
 * Sign off a reservation's flight review with the caller's PIN.
 * `POST /reservations/:id/confirmReview` with `{ pin }`. When the final required pilot
 * confirms, the server auto-generates the invoice — so we invalidate invoices too.
 */
export function useConfirmReview(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmReviewInput) =>
      api<Reservation>(`/reservations/${id}/confirmReview`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

/**
 * Close out a guest reservation — `POST /reservations/:id/confirmReviewGuest`. No PIN: an
 * admin, the instructor, or the creator reviews it and the server generates the guest invoice.
 * `guestOverrides` optionally corrects the guest's contact details before the invoice is emailed.
 */
export function useConfirmReviewGuest(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConfirmReviewGuestInput) =>
      api<Reservation>(`/reservations/${id}/confirmReviewGuest`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
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
    // anyInstructorCanTeach is required by the server; default it so every caller is covered.
    mutationFn: (input: { name: string; defaultInstructorRate: number; anyInstructorCanTeach?: boolean }) =>
      api<OrganizationRating>("/organizations/ratings", {
        method: "POST",
        body: { anyInstructorCanTeach: true, ...input },
      }),
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
    mutationFn: (input: Record<string, unknown>) =>
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

// ---------------------------------------------------------------- member self-pay (Stripe)

/**
 * Everything the Payment Element needs to charge one invoice (`GET /stripe/invoice/:id`):
 * a PaymentIntent client secret + the connected account it lives on. Errors (org not billing-
 * enabled, already paid, no Stripe intent) surface as ApiError for the caller to show.
 * Not cached — a fresh client secret per open, and never retried (a 4xx here is terminal).
 */
export function useInvoicePaymentIntent(invoiceId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["stripe", "invoice", invoiceId],
    queryFn: () => api<InvoicePaymentIntent>(`/stripe/invoice/${invoiceId}`),
    enabled: (opts?.enabled ?? true) && invoiceId != null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    // Don't refetch while the member is entering their card — that would swap the client
    // secret and remount the Payment Element out from under them.
    refetchOnWindowFocus: false,
  });
}

/** The caller's saved cards on this org's connected account (`GET /stripe/paymentMethods`). */
export function usePaymentMethods(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["stripe", "paymentMethods"],
    queryFn: () => api<PaymentMethod[]>("/stripe/paymentMethods"),
    retry: false,
    ...opts,
  });
}

/**
 * The member's own billing settings — autopay + Stripe customer (`GET /orgUsers/billing`).
 * 404s when the org isn't billing-enabled yet; don't retry that.
 */
export function useMyBillingSettings(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUsers", "billing"],
    queryFn: () => api<OrgUserBillingSettings>("/orgUsers/billing"),
    retry: false,
    ...opts,
  });
}

/** Start a card SetupIntent so the member can save a card (`POST /stripe/setupIntent`). */
export function useCreateSetupIntent() {
  return useMutation({
    mutationFn: () => api<SetupIntentResponse>("/stripe/setupIntent", { method: "POST" }),
  });
}

export function useRemovePaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentMethodId: string) =>
      api<void>(`/stripe/paymentMethods/${paymentMethodId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stripe", "paymentMethods"] }),
  });
}

export function useSetDefaultPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (defaultPaymentMethodId: string) =>
      api("/stripe/setDefaultPaymentMethod", { method: "POST", body: { defaultPaymentMethodId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stripe", "paymentMethods"] }),
  });
}

/** Toggle autopay (server requires a default payment method to enable it). */
export function useSetAutoPay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (autoPay: boolean) =>
      api("/stripe/setAutoPay", { method: "POST", body: { autoPay } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stripe", "paymentMethods"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", "billing"] });
    },
  });
}

// ---------------------------------------------------------------- personal / self-service

/** The caller's (or any user's) reservations in a date range. */
export function useUserReservations(userId: number | null, startDate: string, endDate: string, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reservations", "user", userId, startDate, endDate],
    queryFn: () =>
      api<Reservation[]>(`/reservations/user/${userId}`, {
        query: { startDate, endDate, orderBy: "asc", includeCanceled: false },
      }),
    enabled: (opts?.enabled ?? true) && userId != null,
  });
}

/** Invoices for one member (self, or admin viewing another). */
export function useMemberInvoices(
  orgUserId: number | null,
  filter?: { paid?: boolean; startDate?: string; endDate?: string },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["invoices", "member", orgUserId, filter ?? {}],
    queryFn: () => api<Invoice[]>(`/invoices/orgUsers/${orgUserId}`, { query: filter }),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
  });
}

/** The caller's currencies (medicals, flight reviews, checkouts…). */
export function useMyCurrencies(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["currencies", "me"],
    queryFn: () => api<Currency[]>("/currencies"),
    ...opts,
  });
}

/** Resources the caller (or a user) is approved to fly. */
export function useApprovedResources(userId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["approvedResources", userId],
    queryFn: () => api<Resource[]>(`/users/${userId}/approvedResources`),
    enabled: (opts?.enabled ?? true) && userId != null,
  });
}

/** The caller's recurring weekly availability. */
export function useMyAvailability(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["availability", "me"],
    queryFn: () => api<AvailabilityInput>("/users/availability"),
    ...opts,
  });
}

/** The caller's notifications. */
export function useNotifications(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api<AppNotification[]>("/notifications"),
    ...opts,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/notifications/${id}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/notifications", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Update the caller's own name. */
export function useUpdateProfile() {
  return useMutation({
    mutationFn: (input: { name: string }) => api("/users/", { method: "PATCH", body: input }),
  });
}

/** Caller's 4-char confirmation PIN. */
export function usePin(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["pin"],
    queryFn: () => api<{ pin: string | null }>("/users/pin"),
    ...opts,
  });
}

export function useSetPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pin: string) => api("/users/pin", { method: "PATCH", body: { pin } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pin"] }),
  });
}

// ---------------------------------------------------------------- maintenance

export function useSquawks(filter?: { resolved?: boolean }, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["squawks", filter ?? {}],
    queryFn: () => api<Squawk[]>("/maintenance/squawks", { query: filter }),
    ...opts,
  });
}

export function useCreateSquawk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; description?: string; resourceId?: number; grounding?: boolean }) =>
      api("/maintenance/squawks", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["squawks"] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useResolveSquawk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "resolve" | "verify" }) =>
      api(`/maintenance/squawks/${id}`, { method: "POST", body: { action } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["squawks"] }),
  });
}

export function useMaintenanceReminders(filter?: { resolved?: boolean }, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reminders", filter ?? {}],
    queryFn: () => api<MaintenanceReminder[]>("/maintenance/reminders", { query: filter }),
    ...opts,
  });
}
