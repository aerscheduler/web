import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, raw } from "@/lib/api";
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
  Guest,
  OrgUserGroupInput,
  OrgUserGroup,
  ResourceGroupInput,
  ResourceGroup,
  CurrencyTypeInput,
  DocumentType,
  DocumentTypeInput,
  UserDocument,
  Invoice,
  InvoicePaymentIntent,
  InviteInput,
  InstructionPairRequest,
  JoinRequest,
  Location,
  OrgUserBillingSettings,
  PaymentMethod,
  SetupIntentResponse,
  MaintenanceReminder,
  Organization,
  TimeZonePreferences,
  OrgUserPreferences,
  OrganizationBillingSettings,
  OrganizationRating,
  OrganizationUser,
  RampInInput,
  RampOutInput,
  Reservation,
  Resource,
  Role,
  RolesUpdate,
  SearchEntityType,
  SearchResponse,
  Squawk,
  SubscriptionStatus,
  User,
  CancelScope,
  InvoiceUpdate,
  RevenueDimension,
  RevenueReport,
  CancellationCategory,
  CancellationReport,
} from "@/types/api";

/** Options accepted by every read hook (currently just React Query's `enabled`). */
export type QueryOpts = { enabled?: boolean };

export type MemberFilter = Partial<
  Record<
    "admin" | "owner" | "instructor" | "student" | "renter" | "dispatcher" | "technician" | "noRoles",
    boolean
  >
> & {
  q?: string;
  grounded?: boolean;
  /** One or more group IDs (OR). */
  groupId?: number | number[];
};

export type ResourceListFilter = {
  q?: string;
  grounded?: boolean;
  /** One or more location IDs (OR). */
  locationId?: number | number[];
};

export type InvoiceListFilter = {
  q?: string;
  paid?: boolean;
  startDate?: string;
  endDate?: string;
};

export type ReservationListFilter = {
  q?: string;
  /** One or more resource IDs (OR). */
  resourceId?: number | number[];
  /** One or more location IDs (OR). */
  locationId?: number | number[];
};

export type SquawkListFilter = {
  q?: string;
  resolved?: boolean;
  resourceId?: number | number[];
  startDate?: string;
  endDate?: string;
};

export type ReminderListFilter = {
  q?: string;
  resolved?: boolean;
  warned?: boolean;
  resourceId?: number | number[];
};

export type NotificationListFilter = {
  q?: string;
};

export type DocumentListFilter = {
  q?: string;
  documentTypeId?: number | number[];
  includeArchived?: boolean;
  /** One or more of expired | expiring | good (OR). */
  status?: "expired" | "expiring" | "good" | Array<"expired" | "expiring" | "good">;
};

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

export function usePlanes(filter?: ResourceListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "planes", filter ?? {}],
    queryFn: () => api<Resource[]>("/resources/planes", { query: filter }),
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

export function useSimulators(filter?: ResourceListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "simulators", filter ?? {}],
    queryFn: () => api<Resource[]>("/resources/simulators", { query: filter }),
    ...opts,
  });
}

export function useRooms(filter?: ResourceListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "rooms", filter ?? {}],
    queryFn: () => api<Resource[]>("/resources/rooms", { query: filter }),
    ...opts,
  });
}

export function useReservations(
  startDate: string,
  endDate: string,
  filter?: ReservationListFilter,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["reservations", startDate, endDate, filter ?? {}],
    queryFn: () =>
      api<Reservation[]>("/reservations", {
        query: { startDate, endDate, orderBy: "asc", includeCanceled: false, ...filter },
      }),
    ...opts,
  });
}

/**
 * Full single-reservation payload (`GET /reservations/:id`). The schedule list omits
 * plane/sim meter readings; Flutter refetches this before ramp-out so Hobbs/tach are
 * present — the web detail sheet does the same.
 */
export function useReservation(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reservations", id],
    queryFn: () => api<Reservation>(`/reservations/${id}`),
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

export function useInvoices(filter?: InvoiceListFilter, opts?: QueryOpts) {
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

/**
 * Guests on the org's reservations — `GET /organizations/guests`.
 *
 * A Guest is NOT an OrgUser: it's a name/email/phone captured on a reservation,
 * so it can't be a role facet on the roster and gets its own tab. The server
 * serves this to admin, dispatcher and instructor.
 */
export function useGuests(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["guests"],
    queryFn: () => api<Guest[]>("/organizations/guests"),
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

/**
 * Org-wide search across people, aircraft, locations, ratings, reservations,
 * announcements, currencies, documents and squawks — `GET /search`.
 *
 * Pass a DEBOUNCED `q` (see `useDebouncedValue`); every keystroke is a query.
 * An empty `q` is legal and means browse: the newest few rows of each type,
 * which is what the palette shows before anything is typed.
 *
 * `placeholderData: keepPrevious` keeps the last hits on screen while the next
 * request is in flight, so the list refines instead of blanking as you type.
 */
export function useGlobalSearch(
  q: string,
  filter?: { types?: SearchEntityType[]; limit?: number },
  opts?: QueryOpts
) {
  const needle = q.trim();
  return useQuery({
    queryKey: ["search", needle, filter ?? {}],
    queryFn: () =>
      api<SearchResponse>("/search", {
        query: { q: needle || undefined, types: filter?.types, limit: filter?.limit },
      }),
    placeholderData: (prev) => prev,
    // Results are a snapshot of live data; a stale palette is worse than a refetch.
    staleTime: 30_000,
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

/**
 * Edit an existing reservation. The server re-runs `validateReservationType` on
 * whatever body it receives, so this takes the COMPLETE reservation shape (same
 * as create) rather than a patch of changed fields — sending only `{end}` would
 * fail validation for want of a type and personnel.
 */
export function useUpdateReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: CreateReservationInput }) =>
      api<Reservation>(`/reservations/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["availability"] });
    },
  });
}

export function useCancelReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, category, scope }: { id: number; reason?: string; category?: string; scope?: CancelScope }) =>
      api<void>(`/reservations/${id}`, {
        method: "DELETE",
        body: {
          ...(reason ? { reason } : {}),
          ...(category ? { category } : {}),
          //Absent means just this one, which is what the server has always assumed.
          ...(scope && scope !== "this" ? { scope } : {}),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

/**
 * The fixed list of cancellation reasons.
 *
 * Served rather than hardcoded so this and the app can never disagree with the report
 * about what the categories are. Cached hard — it changes on deploy, not during a session.
 */
export function useCancellationCategories() {
  return useQuery({
    queryKey: ["cancellation-categories"],
    queryFn: () => api<CancellationCategory[]>("/reports/cancellations/categories"),
    staleTime: Infinity,
  });
}

/**
 * Revenue grouped by a dimension. One query behind every revenue tab — pass a different
 * `groupBy` and you have the next report.
 */
export function useRevenueReport(
  groupBy: RevenueDimension,
  startDate: string | undefined,
  endDate: string | undefined
) {
  return useQuery({
    queryKey: ["revenue-report", groupBy, startDate, endDate],
    enabled: !!startDate && !!endDate,
    queryFn: () =>
      api<RevenueReport>(
        `/reports/revenue?groupBy=${groupBy}&startDate=${encodeURIComponent(startDate!)}&endDate=${encodeURIComponent(endDate!)}`
      ),
  });
}

/** Why bookings were cancelled over a window, with the counts to chart. */
export function useCancellationReport(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["cancellation-report", startDate, endDate],
    queryFn: () =>
      api<CancellationReport>(
        `/reports/cancellations?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      ),
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
/**
 * One invoice, WITH its line items.
 *
 * The list endpoint doesn't select `items` — only the single-invoice endpoint does — so
 * a detail view that reads the row out of the list array shows an invoice with no lines
 * on it. Always hydrate the drawer from here.
 */
export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: id != null,
    queryFn: () => api<Invoice>(`/invoices/${id}`),
  });
}

/**
 * Mark an invoice paid or voided.
 *
 * The server takes INTENT (`markPaid` / `markVoided`), not timestamps: it has to reach
 * Stripe as well as the row, and it records who did it. Sending `{ paidAt }` — which this
 * used to do — matched nothing, changed nothing, and still returned 200, so the UI showed
 * no error and the invoice silently stayed outstanding.
 */
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    //`raw` rather than `api`: a partial success (our row changed, Stripe didn't) comes
    //back as a `warning` alongside `data`, and `api` unwraps to `data` and drops it.
    mutationFn: async ({ id, patch }: { id: number; patch: InvoiceUpdate }) => {
      const { body } = await raw(`/invoices/${id}`, { method: "PATCH", body: patch });
      const envelope = (body ?? {}) as { data?: Invoice; warning?: string };
      return { invoice: envelope.data, warning: envelope.warning };
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["invoice", vars.id] });
      //Reports and the dashboard both read invoice money.
      void qc.invalidateQueries({ queryKey: ["revenue-report"] });
      void qc.invalidateQueries({ queryKey: ["orgReport"] });
    },
  });
}

/** Admin: email/push a payment reminder for an unpaid member invoice. */
export function useRemindInvoice() {
  return useMutation({
    mutationFn: (id: number) => api<true>(`/invoices/${id}/remind`, { method: "POST" }),
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

/**
 * Create a currency RULE. `gracePeriodDays` never existed on the server — the
 * real field is `warningPeriodInDays`, and the type carries expiration rules,
 * renewal rules, and three scope relations besides.
 *
 * ⚠️ Scope matters: a currency type with no `resourceGroupIds` matches no
 * aircraft in `orgUserIsCurrentForResource`, so it enforces nothing. The server
 * accepts it happily — it just does nothing.
 */
export function useCreateCurrencyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CurrencyTypeInput) =>
      api<CurrencyType>("/currencies/types", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currencyTypes"] }),
  });
}

export function useUpdateCurrencyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<CurrencyTypeInput> }) =>
      api<CurrencyType>(`/currencies/types/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currencyTypes"] }),
  });
}

export function useDeleteCurrencyType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/currencies/types/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["currencyTypes"] }),
  });
}

// ── Groups ───────────────────────────────────────────────────────────────────
// Resource groups scope a currency rule to a set of aircraft; org-user groups
// scope it to a set of people. Reads are any-member; writes are admin.

export function useResourceGroups(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["groups", "resource"],
    queryFn: () => api<ResourceGroup[]>("/groups/resource"),
    ...opts,
  });
}

/** One group WITH its resources — the list endpoint omits them. */
export function useResourceGroup(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["groups", "resource", id],
    queryFn: () => api<ResourceGroup>(`/groups/resource/${id}`),
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

export function useCreateResourceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ResourceGroupInput) =>
      api<ResourceGroup>("/groups/resource", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "resource"] }),
  });
}

export function useUpdateResourceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<ResourceGroupInput> }) =>
      api<ResourceGroup>(`/groups/resource/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "resource"] }),
  });
}

export function useDeleteResourceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/groups/resource/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "resource"] }),
  });
}

export function useOrgUserGroups(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["groups", "orgUser"],
    queryFn: () => api<OrgUserGroup[]>("/groups/orgUser"),
    ...opts,
  });
}

/** One group WITH its members — the list endpoint omits them. */
export function useOrgUserGroup(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["groups", "orgUser", id],
    queryFn: () => api<OrgUserGroup>(`/groups/orgUser/${id}`),
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

export function useCreateOrgUserGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrgUserGroupInput) =>
      api<OrgUserGroup>("/groups/orgUser", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "orgUser"] }),
  });
}

export function useUpdateOrgUserGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<OrgUserGroupInput> }) =>
      api<OrgUserGroup>(`/groups/orgUser/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "orgUser"] }),
  });
}

export function useDeleteOrgUserGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/groups/orgUser/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups", "orgUser"] }),
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

// ---------------------------------------------------------------- QuickBooks / org integrations

export type QuickBooksSettings = {
  id: number;
  enabled: boolean;
  expiredAt: string | null;
  expiresAt: string;
  realmId: string | null;
  companyName: string | null;
  incomeItemId: string | null;
  incomeItemName: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  connectedAt: string | null;
  status: "disconnected" | "connected" | "needs_mapping" | "needs_reconnect" | "error";
  mappingComplete: boolean;
  /** True while Intuit sandbox keys / INTUIT_USE_SANDBOX are in use. */
  useSandbox: boolean;
};

export type QuickBooksItem = { id: string; name: string; type?: string };

export function useQuickBooksSettings(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integrations", "quickbooks", "settings"],
    queryFn: () => api<QuickBooksSettings | null>("/intuit/quickbooks/settings"),
    ...opts,
  });
}

export function useQuickBooksItems(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integrations", "quickbooks", "items"],
    queryFn: () => api<QuickBooksItem[]>("/intuit/quickbooks/items"),
    ...opts,
  });
}

export function useQuickBooksAuthorize() {
  return useMutation({
    mutationFn: () => api<string>("/oauth2/intuit/authorize"),
  });
}

export function useUpdateQuickBooksSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      enabled?: boolean;
      incomeItemId?: string | null;
      incomeItemName?: string | null;
    }) =>
      api<QuickBooksSettings>("/intuit/quickbooks/settings", {
        method: "PATCH",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integrations", "quickbooks"] });
    },
  });
}

export function useDisconnectQuickBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<void>("/intuit/quickbooks/settings", { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integrations", "quickbooks"] });
    },
  });
}

export type QuickBooksSyncEvent = {
  id: number;
  createdAt: string;
  status: "success" | "skipped" | "error" | string;
  message: string | null;
  externalId: string | null;
  invoiceId: number | null;
  triggeredBy: string;
};

export function useQuickBooksActivity(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integrations", "quickbooks", "activity"],
    queryFn: () => api<QuickBooksSyncEvent[]>("/intuit/quickbooks/activity"),
    ...opts,
  });
}

export function useQuickBooksBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (limit?: number) =>
      api<{ attempted: number; synced: number; failed: number; skipped: number }>(
        "/intuit/quickbooks/backfill",
        { method: "POST", body: { limit: limit ?? 25 } }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["integrations", "quickbooks"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useSyncInvoiceToQuickBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      api<{ qboSalesReceiptId: string }>(
        `/intuit/quickbooks/invoices/${invoiceId}/sync`,
        { method: "POST" }
      ),
    onSuccess: (_data, invoiceId) => {
      void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["integrations", "quickbooks", "activity"] });
    },
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
export function useUserReservations(
  userId: number | null,
  startDate: string,
  endDate: string,
  filter?: ReservationListFilter,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["reservations", "user", userId, startDate, endDate, filter ?? {}],
    queryFn: () =>
      api<Reservation[]>(`/reservations/user/${userId}`, {
        query: { startDate, endDate, orderBy: "asc", includeCanceled: false, ...filter },
      }),
    enabled: (opts?.enabled ?? true) && userId != null,
  });
}

/** Invoices for one member (self, or admin viewing another). */
export function useMemberInvoices(
  orgUserId: number | null,
  filter?: InvoiceListFilter,
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

/**
 * Active (non-archived) currency records for one member across every org currency
 * type. There is no "list by orgUser" endpoint — the desk surface fans out
 * `GET /currencies/types/:id/currencies?orgUserId=` per type (admin/dispatcher only).
 */
export function useMemberCurrencies(orgUserId: number | null, opts?: QueryOpts) {
  const typesQ = useCurrencyTypes({
    enabled: (opts?.enabled ?? true) && orgUserId != null,
  });
  const types = typesQ.data ?? [];

  const perType = useQueries({
    queries: types.map((t) => ({
      queryKey: ["currencies", "byType", t.id, orgUserId] as const,
      queryFn: () =>
        api<Currency[]>(`/currencies/types/${t.id}/currencies`, {
          query: { orgUserId: orgUserId! },
        }),
      enabled: (opts?.enabled ?? true) && orgUserId != null && typesQ.isSuccess,
    })),
  });

  const isPending = typesQ.isPending || perType.some((q) => q.isPending);
  const isError = typesQ.isError || perType.some((q) => q.isError);
  // Flatten once results settle — ids are unique across types.
  const settled = perType.map((q) => q.dataUpdatedAt).join(",");
  const data = useMemo(() => {
    if (!typesQ.isSuccess) return undefined;
    const out: Currency[] = [];
    for (const q of perType) {
      if (!q.data) continue;
      for (const c of q.data) {
        if (c.archivedAt == null) out.push(c);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on settled timestamps
  }, [typesQ.isSuccess, settled]);

  return { data, isPending, isError, typesQ, perType };
}

/** Sign off / renew a currency (`POST /currencies/:id` with `{ startedAt }`). */
export function useRenewCurrency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      currencyId,
      startedAt,
    }: {
      currencyId: number;
      startedAt: string;
    }) =>
      api<Currency>(`/currencies/${currencyId}`, {
        method: "POST",
        body: { startedAt },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["currencies"] });
    },
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

/**
 * Who this user is paired with for instruction — their assigned students (if
 * they instruct) and their assigned instructors (if they're a student).
 *
 * `GET /instructors/` and `GET /students/` are both still 501 Not Implemented,
 * but `GET /users/:id` nests the assignments under the role rows, scoped
 * server-side to self-or-admin. That's the only way to read them today.
 */
export function useUserInstructionPartners(userId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["instructionPartners", userId],
    queryFn: async () => {
      const user = await api<User & { orgUsers?: OrganizationUser[] }>(`/users/${userId}`);
      const membership = user.orgUsers?.[0];
      return {
        membership: membership ?? null,
        instructorRoleId: membership?.instructorRole?.id ?? null,
        studentRoleId: membership?.studentRole?.id ?? null,
        students: membership?.instructorRole?.students ?? [],
        instructors: membership?.studentRole?.instructors ?? [],
      };
    },
    enabled: (opts?.enabled ?? true) && userId != null,
  });
}

/** @deprecated Prefer useUserInstructionPartners — same query key `/me` already uses. */
export function useMyInstructionPartners(userId: number | null, opts?: QueryOpts) {
  return useUserInstructionPartners(userId, opts);
}

/** Admin assign pair — ids are Student / Instructor role PKs. */
export function useAssignInstructionPair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: number; instructorId: number }) =>
      api(`/students/assign`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

/** Admin unassign pair. */
export function useUnassignInstructionPair() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: number; instructorId: number }) =>
      api(`/students/unassign`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

/** Student removes themselves from an instructor. */
export function useUnassignSelfAsStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: number; instructorId: number }) =>
      api(`/students/unassignStudentFromInstructor`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
    },
  });
}

/** Instructor removes themselves from a student. */
export function useUnassignSelfAsInstructor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: number; instructorId: number }) =>
      api(`/instructors/unassignInstructorFromStudent`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
    },
  });
}

/** Instructor requests a student (admin must accept). */
export function useRequestStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { studentId: number }) =>
      api(`/students/requests`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionRequests"] });
    },
  });
}

/** Student requests an instructor (admin must accept). */
export function useRequestInstructor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { instructorId: number }) =>
      api(`/instructors/requests`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionRequests"] });
    },
  });
}

export function useStudentPairRequests(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["instructionRequests", "students"],
    queryFn: () => api<InstructionPairRequest[]>("/students/requests"),
    ...opts,
  });
}

export function useInstructorPairRequests(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["instructionRequests", "instructors"],
    queryFn: () => api<InstructionPairRequest[]>("/instructors/requests"),
    ...opts,
  });
}

export function useRespondStudentPairRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "accept" | "decline" }) =>
      api(`/students/requests/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionRequests"] });
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
    },
  });
}

export function useRespondInstructorPairRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "accept" | "decline" }) =>
      api(`/instructors/requests/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionRequests"] });
      void qc.invalidateQueries({ queryKey: ["instructionPartners"] });
    },
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
export function useNotifications(filter?: NotificationListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["notifications", filter ?? {}],
    queryFn: () => api<AppNotification[]>("/notifications", { query: filter }),
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

/**
 * Create a document type (admin only). The server rejects an expiring type with no
 * `warningPeriod` ("Missing warning period"), so the form requires one first.
 */
export function useCreateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentTypeInput) =>
      api<DocumentType>("/userDocuments/types", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentTypes"] }),
  });
}

/**
 * Edit a document type (admin only). Turning `expires` off also clears `expiresAt` on
 * every document already filed under the type, server-side.
 */
export function useUpdateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<DocumentTypeInput> & { id: number }) =>
      api<DocumentType>(`/userDocuments/types/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentTypes"] }),
  });
}

/** Soft-delete a document type (admin only) — 204, no body. Filed documents survive. */
export function useDeleteDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/userDocuments/types/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentTypes"] }),
  });
}

/** A member's documents (self, or admin viewing another) — `GET /userDocuments/orgUsers/:id`. */
export function useMemberDocuments(
  orgUserId: number | null,
  filter?: DocumentListFilter,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["documents", orgUserId, filter ?? {}],
    queryFn: () => api<UserDocument[]>(`/userDocuments/orgUsers/${orgUserId}`, { query: filter }),
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

export function useSquawks(filter?: SquawkListFilter, opts?: QueryOpts) {
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

/**
 * Resolve or verify a squawk.
 *
 * `resolve` REQUIRES `completedAt` — when the work was actually finished, which
 * is not the same as when it's being signed off (the server stamps `resolvedAt`
 * itself). Omitting it fails with "Completed at is required." `notes` records
 * what was done and is optional. `verify` takes neither.
 */
export function useResolveSquawk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      completedAt,
      notes,
    }: {
      id: number;
      action: "resolve" | "verify";
      completedAt?: string;
      notes?: string;
    }) =>
      api(`/maintenance/squawks/${id}`, {
        method: "POST",
        body: {
          action,
          ...(completedAt ? { completedAt } : {}),
          ...(notes?.trim() ? { notes: notes.trim() } : {}),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["squawks"] });
      // A resolved squawk changes the airworthiness hints on the booking forms.
      void qc.invalidateQueries({ queryKey: ["resources"] });
    },
  });
}

export function useMaintenanceReminders(filter?: ReminderListFilter, opts?: QueryOpts) {
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

/**
 * The signed-in member's time-zone settings.
 *
 * Read from the same `/orgUser/preferences` row the notification settings live on — the
 * server creates it on demand, so there is no "no preferences yet" case to handle here.
 * Cached hard: a zone preference changes about once a year, and re-resolving it on every
 * window focus would re-render the whole board for nothing.
 */
export function useTimeZonePreferences(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUser", "preferences", "timezone"],
    queryFn: () => api<TimeZonePreferences>("/orgUsers/preferences"),
    enabled: opts?.enabled ?? true,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Update the member's own zone settings. */
export function useUpdateTimeZonePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: TimeZonePreferences) =>
      api<TimeZonePreferences>("/orgUsers/preferences", { method: "PATCH", body: patch }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orgUser", "preferences"] });
    },
  });
}

/** Full org-user preferences including notification toggles. */
export function useOrgUserPreferences(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUser", "preferences"],
    queryFn: () => api<OrgUserPreferences>("/orgUsers/preferences"),
    enabled: opts?.enabled ?? true,
    staleTime: 60_000,
  });
}

/** Patch notification (or timezone) preferences on the same preferences row. */
export function useUpdateOrgUserPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<OrgUserPreferences>) =>
      api<OrgUserPreferences>("/orgUsers/preferences", { method: "PATCH", body: patch }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["orgUser", "preferences"] });
      const previous = qc.getQueryData<OrgUserPreferences>(["orgUser", "preferences"]);
      if (previous) {
        const nextNotif = patch.notificationPreferences
          ? {
              ...previous.notificationPreferences,
              ...patch.notificationPreferences,
              emailNotificationPreferences: {
                ...previous.notificationPreferences?.emailNotificationPreferences,
                ...patch.notificationPreferences.emailNotificationPreferences,
              },
              pushNotificationPreferences: {
                ...previous.notificationPreferences?.pushNotificationPreferences,
                ...patch.notificationPreferences.pushNotificationPreferences,
              },
            }
          : previous.notificationPreferences;
        qc.setQueryData<OrgUserPreferences>(["orgUser", "preferences"], {
          ...previous,
          ...patch,
          notificationPreferences: nextNotif,
        });
      }
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["orgUser", "preferences"], ctx.previous);
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["orgUser", "preferences"] });
    },
  });
}

/**
 * Set the organization's primary time zone.
 *
 * Invalidates broadly on purpose: this changes the zone every schedule, agenda and detail
 * view renders in, so anything holding a formatted time is now stale.
 */
export function useUpdateOrganizationTimeZone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (timeZone: string | null) =>
      api<Organization>("/organizations/", { method: "PATCH", body: { timeZone } }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: (message: string) => api<void>("/support", { method: "POST", body: { message } }),
  });
}
