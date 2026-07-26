import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  coordinateKey,
  fetchNearestObservation,
  fetchSunTimes,
  FAILURE_STALE_MS,
  METAR_STALE_MS,
  type Coordinates,
  type Observation,
  type SunTimes,
} from "@/lib/weather";
import {
  presignedObjectUrl,
  uploadToPresignedPost,
  type PresignedPost,
} from "@/lib/upload";
import type {
  Announcement,
  AppNotification,
  AvailabilityInput,
  AvailabilityWindow,
  CreateInvoiceInput,
  CreateLocationInput,
  ConfirmReviewInput,
  CreatePlaneResourceInput,
  CreateReservationInput,
  CreateRoomResourceInput,
  CreateSimulatorResourceInput,
  ConfirmReviewGuestInput,
  Currency,
  CurrencyType,
  DocumentType,
  UserDocument,
  Invoice,
  InvoicePaymentIntent,
  InviteInput,
  JoinRequest,
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
  Role,
  RolesUpdate,
  Squawk,
  SubscriptionStatus,
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

export function useSimulators(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "simulators"],
    queryFn: () => api<Resource[]>("/resources/simulators"),
    ...opts,
  });
}

export function useRooms(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "rooms"],
    queryFn: () => api<Resource[]>("/resources/rooms"),
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

export function useCreateSimulator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSimulatorResourceInput) =>
      api<Resource>("/resources", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useCreateRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoomResourceInput) =>
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
      // Refresh the caller's bookable fleet (the /me/book "checked out" list)
      // so a just-approved renter sees the aircraft without a reload.
      void qc.invalidateQueries({ queryKey: ["approvedResources"] });
    },
  });
}

// ---------------------------------------------------------------- join requests

/** Pending requests to join the org (admin). `GET /joinRequests`. */
export function useJoinRequests(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["joinRequests"],
    queryFn: () => api<JoinRequest[]>("/joinRequests"),
    ...opts,
  });
}

/** Accept a join request, optionally assigning an initial role. `POST /joinRequests/:id/accept`. */
export function useAcceptJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role?: Role }) =>
      api(`/joinRequests/${id}/accept`, { method: "POST", body: role ? { role } : {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["joinRequests"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeclineJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api(`/joinRequests/${id}/decline`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["joinRequests"] }),
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

/**
 * Upload a new org logo: presign → PUT the file to S3 → PATCH the org with the public URL.
 * Returns the stored URL. Caller should `rehydrate()` after so the session picks up the change.
 */
export function useUpdateOrgLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const presigned = await api<PresignedPost>("/organizations/orgProfileImage/signedUrl");
      await uploadToPresignedPost(presigned, file);
      const profileImageUrl = presignedObjectUrl(presigned);
      await api<void>("/organizations/orgProfileImage", {
        method: "PATCH",
        body: { profileImageUrl },
      });
      return profileImageUrl;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization"] }),
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

// ---------------------------------------------------------------- per-aircraft subscription
/** The org's per-aircraft platform subscription status (`GET /subscription`). */
export function useSubscription(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: () => api<SubscriptionStatus>("/subscription"),
    ...opts,
  });
}

/** Start Stripe Checkout for the per-aircraft subscription → returns `{ url }`. */
export function useSubscriptionCheckout() {
  return useMutation({
    mutationFn: (body: { successUrl?: string; cancelUrl?: string } = {}) =>
      api<{ url: string }>("/subscription/checkout", { method: "POST", body }),
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

// ── Free-window availability (powers smart scheduling) ───────────────────────
// These endpoints return the INVERSE of existing reservations — free windows
// with booked time already subtracted server-side (matching the server's
// resourceIsAvailable / orgUserIsAvailable overlap checks at create time).
// They ignore date-range params and return ~[yesterday, +1yr], so callers slice
// to the selected day client-side.

/** A resource's free (conflict-free) windows. */
export function useResourceAvailability(resourceId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["availability", "resource", resourceId],
    queryFn: () => api<AvailabilityWindow[]>(`/availability/resource/${resourceId}`),
    enabled: (opts?.enabled ?? true) && resourceId != null,
    staleTime: 30_000,
  });
}

/**
 * Free windows for each user (keyed by USER id, not org-user id) — one query per
 * id via useQueries so the set can vary with the personnel selection. Returns a
 * stable array aligned to `userIds`.
 */
export function useUsersAvailability(userIds: number[], opts?: QueryOpts) {
  const enabled = opts?.enabled ?? true;
  return useQueries({
    queries: userIds.map((id) => ({
      queryKey: ["availability", "user", id],
      queryFn: () => api<AvailabilityWindow[]>(`/availability/user/${id}`),
      enabled: enabled && id != null,
      staleTime: 30_000,
    })),
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

/** Caller's 4-char confirmation PIN. The endpoint returns the PIN string (or null) directly. */
export function usePin(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["pin"],
    queryFn: () => api<string | null>("/users/pin"),
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

// ---------------------------------------------------------------- reports (admin)

export type ReportRange = { startDate: string; endDate: string };

/**
 * A single org report metric (`GET /reports/organization/:metric`). Date-ranged metrics
 * (flight time, reservations, payments, members) require a range and are gated on it; the
 * status metrics (`countUnresolvedSquawks`, `countGroundedResources`) take no range.
 */
export function useOrgReport<T>(
  metric: string,
  range?: ReportRange,
  opts?: QueryOpts & { rangeRequired?: boolean }
) {
  const rangeRequired = opts?.rangeRequired ?? true;
  return useQuery({
    queryKey: ["reports", "org", metric, range ?? {}],
    queryFn: () =>
      api<T>(`/reports/organization/${metric}`, {
        query: range ? { startDate: range.startDate, endDate: range.endDate } : undefined,
      }),
    enabled: (opts?.enabled ?? true) && (!rangeRequired || range != null),
  });
}

// ---------------------------------------------------------------- documents

/** Org-defined document categories (`GET /userDocuments/types`). */
export function useDocumentTypes(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["documentTypes"],
    queryFn: () => api<DocumentType[]>("/userDocuments/types"),
    ...opts,
  });
}

/** A member's documents (self, or admin viewing another) — `GET /userDocuments/orgUsers/:id`. */
export function useMemberDocuments(orgUserId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["documents", orgUserId],
    queryFn: () => api<UserDocument[]>(`/userDocuments/orgUsers/${orgUserId}`),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
  });
}

/**
 * Upload a document: create the record (`POST /userDocuments/`) to get the presigned target,
 * then PUT the file to S3. Replaces any current document of the same type by default.
 *
 * `orgUserId` files the document against another member instead of the caller — the server
 * requires the caller to be an org admin to do that, and 403s otherwise. Send it as a number:
 * the route compares it to the caller's own id with `!==`, so a numeric string would take the
 * on-behalf-of branch even when it names the caller.
 */
export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentTypeId: number;
      file: File;
      expiresAt?: string;
      orgUserId?: number;
    }) => {
      const res = await api<{ document: UserDocument; signedUrlData: PresignedPost }>(
        "/userDocuments/",
        {
          method: "POST",
          body: {
            documentTypeId: input.documentTypeId,
            fileName: input.file.name,
            ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
            ...(input.orgUserId != null ? { orgUserId: input.orgUserId } : {}),
            archiveExistingDocumentsOfThisType: true,
          },
        }
      );
      await uploadToPresignedPost(res.signedUrlData, input.file);
      return res.document;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
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

// ── Google Calendar integration ─────────────────────────────────────────────
/** Whether the caller has connected Google Calendar. GET /integrations/googleCalendar
 *  returns { data: true } when connected and 404 when not. */
export function useGoogleCalendarStatus(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integration", "googleCalendar"],
    queryFn: async () => {
      try {
        await api("/integrations/googleCalendar");
        return true;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return false;
        throw e;
      }
    },
    ...opts,
  });
}

/** Connect Google Calendar with a server auth code from the web popup code flow. */
export function useConnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (serverAuthCode: string) =>
      api("/integrations/googleCalendar", {
        method: "POST",
        body: { serverAuthCode, web: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration", "googleCalendar"] }),
  });
}

// ── Pre-flight weather (third-party, keyless) ────────────────────────────────
// NOT AerScheduler API calls: these go straight to aviationweather.gov and
// api.sunrise-sunset.org, so they use the plain fetches in lib/weather.ts rather than
// api()/apiRaw() — those attach our Authorization header and unwrap a `{ data }`
// envelope that neither service returns.
//
// React Query is this feature's entire cache; it replaces the hand-rolled maps in the
// Flutter WeatherService. Keys are ROUNDED coordinates (plus the date, for sun times), so
// every reservation at the same field shares one cache entry and one in-flight request —
// which is what keeps a month-long board far under aviationweather.gov's ~100 req/min.
// The fetches never reject: a failure resolves to null, is held for FAILURE_STALE_MS so an
// offline browser doesn't re-request on every badge that mounts, and renders nothing.

/**
 * The nearest METAR to a set of coordinates. Only worth asking for a flight inside the
 * 12-hour observation window (see `shouldIncludeObservation`) — an observation says
 * nothing about a flight three weeks out.
 */
export function useMetarObservation(coordinates: Coordinates | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["weather", "metar", coordinates ? coordinateKey(coordinates) : null],
    queryFn: ({ signal }): Promise<Observation | null> =>
      coordinates ? fetchNearestObservation(coordinates, signal) : Promise.resolve(null),
    enabled: (opts?.enabled ?? true) && coordinates != null,
    // Observations are hourly (SPECIs excepted); a failed lookup is held far shorter.
    staleTime: (query) => (query.state.data == null ? FAILURE_STALE_MS : METAR_STALE_MS),
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Sunset and civil twilight for one day at one point (`day` is `YYYY-MM-DD`, in the
 * flight's own timezone). Courtesy of sunrise-sunset.org, which requires attribution —
 * the weather badge's tooltip carries it.
 */
export function useSunTimes(coordinates: Coordinates | null, day: string | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["weather", "sun", coordinates ? coordinateKey(coordinates) : null, day],
    queryFn: ({ signal }): Promise<SunTimes | null> =>
      coordinates && day ? fetchSunTimes(coordinates, day, signal) : Promise.resolve(null),
    enabled: (opts?.enabled ?? true) && coordinates != null && day != null,
    // Sunset for a given day and place never changes, so a hit is cached for the whole
    // session and never refetched. Only a failure is allowed to be retried.
    staleTime: (query) => (query.state.data == null ? FAILURE_STALE_MS : Infinity),
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
