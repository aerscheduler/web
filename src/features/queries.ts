import { useMemo } from "react";
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { api, apiList, apiRaw, ApiError, raw, type PaginationMeta } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { Paged, PagingState } from "@/lib/paging";
import { outstandingHolds } from "@/lib/outstanding-holds";
import type { CurrencyRuleDetail, CurrencyRuleStanding } from "@/types/currency-rule";
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
  AdReadiness,
  AdTrackingMode,
  AirportMatch,
  Announcement,
  ApiKey,
  ApiKeyInput,
  ApiKeyWithSecret,
  AppNotification,
  AuditEvent,
  AvailabilityInput,
  AvailabilityWindow,
  CancelScope,
  CancellationCategory,
  CancellationReport,
  CandidateEnrollment,
  ConfirmReviewGuestInput,
  ConfirmReviewInput,
  CorrectReviewTimesInput,
  Course,
  CourseVersion,
  CreateInvoiceInput,
  CreateLocationInput,
  CreatePlaneResourceInput,
  CreateReminderTemplateInput,
  CreateReservationInput,
  CreateRoomResourceInput,
  CreateSimulatorResourceInput,
  Currency,
  CurrencyType,
  CurrencyTypeInput,
  CurriculumTemplateSummary,
  DocumentType,
  DocumentTypeInput,
  EmergencyContact,
  Endorsement,
  EndorsementTemplate,
  EnrollmentProgress,
  EnrollmentSummary,
  GrantOption,
  GrantRow,
  Guest,
  InspectionPreset,
  InstructionPairRequest,
  InviteInput,
  Invoice,
  InvoicePaymentIntent,
  InvoiceUpdate,
  JoinRequest,
  LedgerAccount,
  LedgerAccountSummary,
  LedgerAutoRefill,
  LedgerEntry,
  LedgerRefundable,
  LedgerStatement,
  LedgerTopUpConfirm,
  LedgerTopUpIntent,
  Location,
  MaintenanceComplianceRecord,
  MaintenanceReminder,
  MaintenanceReminderTemplate,
  MemberLedger,
  MemberPermissions,
  Membership,
  MembershipPlan,
  MembershipPlanOption,
  MembershipPlanRate,
  MembershipStatus,
  MultiDayReadiness,
  MyMembership,
  MyTrainingGrants,
  OrgOnboarding,
  OrgUserBillingSettings,
  OrgUserGroup,
  OrgUserGroupInput,
  OrgUserPreferences,
  Organization,
  OrganizationBillingSettings,
  OrganizationLedgerSettings,
  OrganizationRating,
  OrganizationUser,
  PaymentMethod,
  RampInInput,
  RampOutInput,
  Reservation,
  ReservationPayerInput,
  ReservationPaymentOverridesInput,
  Resource,
  ResourceGroup,
  ResourceGroupInput,
  RevenueDimension,
  RevenueReport,
  Role,
  RolesUpdate,
  SearchEntityType,
  SearchResponse,
  SetupIntentResponse,
  SmsStatus,
  SplitRulesDescription,
  Squawk,
  SquawkComment,
  SubscriptionStatus,
  TimeZonePreferences,
  TrainingGrant,
  TrainingGrantOption,
  UpdateLocationInput,
  User,
  UserDetails,
  UserDocument,
} from "@/types/api";

/** Options accepted by every read hook (currently just React Query's `enabled`). */
export type QueryOpts = { enabled?: boolean };

//---------------------------------------------------------------------------------
// Paged reads.
//
// Two hooks exist for most collections and the difference matters:
//
//   useMembers(filter)            , up to the API's 1,000-row cap, as an array.
//                                    For pickers, counts and anything that has to
//                                    see the whole set. Paging a combobox to 25
//                                    silently loses options.
//   useMembersPage(filter, paging). ONE page, plus the total. For tables.
//
// Anything rendered in a <DataTable> takes the `*Page` form; DataTable requires
// the paging state, so this is enforced rather than remembered.
//---------------------------------------------------------------------------------

/**
 * A paged list read.
 *
 * `placeholderData` holds the previous page on screen while the next one loads,
 * so paging refines the table instead of blanking it, the same reason the
 * report shell does it. Without it every page change flashes an empty table and
 * the row heights jump.
 */
function usePagedList<T>(
  key: unknown[],
  path: string,
  paging: PagingState,
  filter?: Record<string, unknown>,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: [...key, { ...(filter ?? {}), ...paging.query }],
    queryFn: async (): Promise<Paged<T>> => {
      const { data, pagination } = await apiList<T>(path, {
        query: { ...(filter ?? {}), ...paging.query } as Record<string, string | number | boolean | undefined>,
      });
      return { rows: data, total: pagination.total, hasMore: pagination.hasMore };
    },
    placeholderData: (prev) => prev,
    ...opts,
  });
}

/** What a table reads off a paged query, safe before the first response lands. */
export function pageRows<T>(q: { data?: Paged<T> }): { rows: T[]; total: number } {
  return { rows: q.data?.rows ?? [], total: q.data?.total ?? 0 };
}

export type MemberFilter = Partial<
  Record<
    "admin" | "owner" | "instructor" | "student" | "renter" | "dispatcher" | "technician" | "noRoles",
    boolean
  >
> & {
  q?: string;
  grounded?: boolean;
  /**
   * `true` returns the ARCHIVED roster instead of the current one. Omitting it, like
   * every caller that predates archiving, returns current members only, which is the
   * server's default too. There is deliberately no "both".
   */
  archived?: boolean;
  /** One or more group IDs (OR). */
  groupId?: number | number[];
  /**
   * An aircraft id. Every member comes back carrying `approvedForResource`, so a
   * whole roster's approvals read in one request instead of one per person.
   */
  approvedForResourceId?: number;
  /** With `approvedForResourceId`, return only those approved. Ignored on its own. */
  approved?: boolean;
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
  /** Voided is its own axis: `paid: false` alone still includes voided invoices,
   *  which nobody owes. Pass `voided: false` for "outstanding". */
  voided?: boolean;
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

export type ComplianceListFilter = {
  q?: string;
  resourceId?: number[];
  reminderId?: number;
  sourceType?: string;
  startDate?: string;
  endDate?: string;
};

export type ReminderListFilter = {
  q?: string;
  resolved?: boolean;
  warned?: boolean;
  resourceId?: number | number[];
  /** Filters on the server's computed band, which no column could have filtered on. */
  status?: MaintenanceDueStatus | MaintenanceDueStatus[];
};

export type MaintenanceDueStatus = "overdue" | "dueSoon" | "ok" | "resolved";

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

/** One page of the roster, for the People table. */
export function useMembersPage(filter: MemberFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<OrganizationUser>(["members"], "/orgUsers", paging, filter, opts);
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

/** One row of the public aircraft registry, as returned by the tail-number lookup. */
export type RegistryMatch = {
  tailNumber: string;
  /** The data-plate serial as the federal file has it. Null on rows that do not carry one. */
  serialNumber: string | null;
  make: string;
  model: string;
  year: number | null;
  category: string | null;
  aircraftClass: string | null;
  engineType: string | null;
  gearType: string | null;
  seats: number | null;
  /** @deprecated Derived from the pair above. */
  categoryClass: string | null;
};

/**
 * Tail-number lookup for the add-aircraft form. Held for a while because the registry
 * changes weekly at most, and a person correcting a typo re-runs the same few queries.
 *
 * An empty result is a normal answer, not an error: our copy covers US registrations
 * only, and the form works the same either way.
 */
export function useRegistryLookup(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["resources", "registry", q],
    queryFn: () => api<RegistryMatch[]>("/resources/registry", { query: { q } }),
    enabled: enabled && q.length >= 2,
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

/**
 * Airport lookup for the add-location form. Held for a while for the same reasons as the
 * tail-number lookup: the source refreshes weekly at most, and a person correcting a typo
 * re-runs the same few queries.
 *
 * An empty result is a normal answer, not an error. Unlike the aircraft registry this
 * copy is worldwide, but a private strip with no published identifier is still a thing
 * people type, and the form works the same either way.
 */
export function useAirportLookup(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["locations", "airports", q],
    queryFn: () => api<AirportMatch[]>("/locations/airports", { query: { q } }),
    enabled: enabled && q.length >= 2,
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function usePlanes(filter?: ResourceListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "planes", filter ?? {}],
    queryFn: () => api<Resource[]>("/resources/planes", { query: filter }),
    ...opts,
  });
}

/** One page of the fleet, for the Aircraft table. */
export function usePlanesPage(filter: ResourceListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Resource>(["resources", "planes"], "/resources/planes", paging, filter, opts);
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

export function useSimulatorsPage(filter: ResourceListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Resource>(["resources", "simulators"], "/resources/simulators", paging, filter, opts);
}

export function useRoomsPage(filter: ResourceListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Resource>(["resources", "rooms"], "/resources/rooms", paging, filter, opts);
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
 * present, the web detail sheet does the same.
 */
/**
 * One page of reservations in a window, for the tables built on them (Billing's
 * unbilled list, Cancellations). The board views keep `useReservations`: a day
 * grid draws every block in its window and has no page to be on.
 */
export function useReservationsPage(
  startDate: string,
  endDate: string,
  filter:
    | (ReservationListFilter & {
        includeCanceled?: boolean;
        /** Only bookings with no invoice yet. Billing's "unbilled flights". */
        uninvoiced?: boolean;
        /**
         * Only bookings that have already finished. The date range is an overlap
         * query, so narrowing `endDate` does NOT exclude a flight that is still out.
         */
        endedBefore?: string;
      })
    | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<Reservation>(
    ["reservations", "page", startDate, endDate],
    "/reservations",
    paging,
    { startDate, endDate, orderBy: "asc", includeCanceled: false, ...filter },
    opts
  );
}

export function useReservation(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reservations", id],
    queryFn: () => api<Reservation>(`/reservations/${id}`),
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

/**
 * One reservation's audit trail. `GET /audit/reservation/:id`, oldest first.
 *
 * Separate from `useReservation` rather than folded into it because the trail is only ever
 * read when a sheet is open, while the reservation itself is on every board. Its own key
 * also means a close-out mutation can invalidate the trail without refetching the board.
 */
/** Filters the Audit Logs table sends to `GET /audit`. */
export type AuditListFilter = {
  entityType?: string;
  actorOrgUserId?: number;
  resourceId?: number;
  startDate?: string;
  endDate?: string;
};

/**
 * The organization's audit feed, paged server-side like every other table.
 *
 * Admin-only on the server, so this is only ever mounted behind the same guard, a
 * non-admin reaching it would get a 403 rather than an empty table.
 */
export function useAuditPage(filter: AuditListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<AuditEvent>(["audit"], "/audit", paging, filter, opts);
}

export function useReservationAudit(reservationId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["audit", "reservation", reservationId],
    queryFn: () => api<AuditEvent[]>(`/audit/reservation/${reservationId}`),
    enabled: (opts?.enabled ?? true) && reservationId != null,
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
/**
 * Invoice totals for a window. `GET /invoices/summary`.
 *
 * Aggregated by the database. The Billing cards used to be summed from
 * `useInvoices()` in the browser, which stopped being merely slow and started
 * being wrong once list responses were capped at 1,000 rows: a school with more
 * invoices than that in the range was shown the total of an arbitrary thousand.
 */
export function useInvoiceSummary(
  filter?: { startDate?: string; endDate?: string; q?: string; voided?: boolean },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["invoices", "summary", filter ?? {}],
    queryFn: () =>
      api<{ revenue: number; paidCount: number; outstanding: number; outstandingCount: number }>(
        "/invoices/summary",
        { query: filter }
      ),
    ...opts,
  });
}

/** One page of the org's invoices, for the Billing table. */
export function useInvoicesPage(filter: InvoiceListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Invoice>(["invoices"], "/invoices", paging, filter, opts);
}

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

/**
 * ONE location, in full.
 *
 * Worth its own call because the list endpoint's select is `id, name, address,
 * showInDirectory`: it does not return `timeZone`. A row from `useLocations()` therefore
 * says nothing at all about the airport's zone, and rendering "not set" from it would be
 * a lie about the one field multi-day bookings are pinned to. Ask here before editing.
 */
export function useLocation(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["locations", id],
    queryFn: () => api<Location>(`/locations/${id}`),
    // Deliberately not spreading `opts` after this: it would put `enabled` back and the
    // query would fire at /locations/null.
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

/**
 * Full records for several locations at once, one request each, aligned to `ids`.
 *
 * Same reason as {@link useLocation}, applied to a list that wants to show which airports
 * still have no zone. A school has a handful of them (one per field it operates from), so
 * the fan-out is bounded. Do not reach for this to decorate a table of anything larger.
 */
export function useLocationDetails(ids: number[], opts?: QueryOpts) {
  const enabled = opts?.enabled ?? true;
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["locations", id],
      queryFn: () => api<Location>(`/locations/${id}`),
      enabled,
      staleTime: 30_000,
    })),
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
 * Guests on the org's reservations. `GET /organizations/guests`.
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

/** One page of guests, for the Guests tab on People. */
export function useGuestsPage(
  paging: PagingState,
  filter?: { q?: string },
  opts?: QueryOpts
) {
  return usePagedList<Guest>(["guests"], "/organizations/guests", paging, filter, opts);
}

export function useCurrencyTypes(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["currencyTypes"],
    queryFn: () => api<CurrencyType[]>("/currencies/types"),
    ...opts,
  });
}

export function useCurrencyRuleDetail(
  currencyTypeId: number,
  filter?: { q?: string; status?: CurrencyRuleStanding; limit?: number; offset?: number },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["currencyTypes", "detail", currencyTypeId, filter ?? {}],
    queryFn: () =>
      api<CurrencyRuleDetail>(`/currencies/types/${currencyTypeId}/detail`, {
        query: filter,
      }),
    enabled: (opts?.enabled ?? true) && Number.isFinite(currencyTypeId),
  });
}

/** One page of currency types, for the Settings table. */
export function useCurrencyTypesPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<CurrencyType>(["currencyTypes"], "/currencies/types", paging, undefined, opts);
}

/** One page of instruction rates, for the Settings table. */
export function useRatingsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<OrganizationRating>(["ratings"], "/organizations/ratings", paging, undefined, opts);
}

export function useBilling(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["billing"],
    queryFn: () => api<OrganizationBillingSettings>("/organizations/billing"),
    ...opts,
  });
}

const EMPTY_LEDGER_ACCOUNT_SUMMARY: LedgerAccountSummary = {
  receivableCents: 0,
  creditOnAccountCents: 0,
  owingCount: 0,
  creditCount: 0,
  zeroCount: 0,
  memberCount: 0,
};

export type LedgerAccountFilter = {
  q?: string;
  status?: string | string[];
};

/** School-wide ledger roster (`GET /organizations/ledger/accounts`). Admin only. */
export function useLedgerAccountsPage(
  filter: LedgerAccountFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["ledger", "accounts", { ...(filter ?? {}), ...paging.query }],
    queryFn: async (): Promise<Paged<LedgerAccount> & { summary: LedgerAccountSummary }> => {
      const body = await apiRaw<{
        data?: LedgerAccount[];
        pagination?: PaginationMeta;
        summary?: LedgerAccountSummary;
      }>("/organizations/ledger/accounts", {
        query: { ...(filter ?? {}), ...paging.query },
      });
      const rows = body.data ?? [];
      return {
        rows,
        total: body.pagination?.total ?? rows.length,
        hasMore: body.pagination?.hasMore ?? false,
        summary: body.summary ?? EMPTY_LEDGER_ACCOUNT_SUMMARY,
      };
    },
    placeholderData: (prev) => prev,
    ...opts,
  });
}

/** Org ledger mode (`GET /organizations/ledger`). Any member may read. */
export function useOrgLedgerSettings(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["organizations", "ledger"],
    queryFn: () => api<OrganizationLedgerSettings>("/organizations/ledger"),
    ...opts,
  });
}

/** Owner: ledger mode and optional card surcharge on top-ups (`PATCH /organizations/ledger`). */
export function useUpdateOrgLedgerSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      enabled?: boolean;
      topUpCardFeePercent?: number | null;
      topUpCardFeeFlatCents?: number | null;
      lateFeePercent?: number | null;
      lateFeeFlatCents?: number | null;
      lateFeeGraceDays?: number | null;
    }) => api<OrganizationLedgerSettings>("/organizations/ledger", { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["organizations", "ledger"] });
      void qc.invalidateQueries({ queryKey: ["billing"] });
      // Member ledgers embed `ledgerEnabled`; refresh so Add funds / desk actions appear.
      void qc.invalidateQueries({ queryKey: ["orgUsers"] });
    },
  });
}

export function useLedgerAutoRefill(orgUserId: number | null | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger", "auto-refill"],
    queryFn: () => api<LedgerAutoRefill>(`/orgUsers/${orgUserId}/ledger/auto-refill`),
    enabled: orgUserId != null,
    ...opts,
  });
}

export function useUpdateLedgerAutoRefill(orgUserId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<LedgerAutoRefill>) =>
      api<LedgerAutoRefill>(`/orgUsers/${orgUserId}/ledger/auto-refill`, {
        method: "PATCH",
        body: input,
      }),
    onSuccess: (data) => {
      qc.setQueryData(["orgUsers", orgUserId, "ledger", "auto-refill"], data);
    },
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
 * announcements, currencies, documents and squawks. `GET /search`.
 *
 * Pass a DEBOUNCED `q` (see `useDebouncedValue`); every keystroke is a query.
 * An empty `q` is legal and means browse: the newest few rows of each type,
 * which is what the palette shows before anything is typed.
 *
 * `placeholderData: keepPrevious` keeps the last hits on screen while the next
 * request is in flight, so the list refines instead of blanking as you type.
 */
/** Admin: post a school notice. `POST /announcements`. */
export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      title: string;
      message: string;
      expireAt?: string | null;
      forRoles?: Role[] | null;
    }) => api<Announcement>("/announcements", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** Admin: edit a notice. `PATCH /announcements/:id`. */
export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: number;
      title?: string;
      message?: string;
      expireAt?: string | null;
      forRoles?: Role[] | null;
    }) => api<Announcement>(`/announcements/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** Member: hide a notice from Home. `POST /announcements/:id/seen`. */
export function useMarkAnnouncementSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Announcement>(`/announcements/${id}/seen`, { method: "POST", body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** Admin: remove a notice. `DELETE /announcements/:id`. */
export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<Announcement>(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
}

/** One page of announcements, for the Announcements table. */
export function useAnnouncementsPage(
  filter: { q?: string; expired?: boolean } | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<Announcement>(["announcements"], "/announcements", paging, filter, opts);
}

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
    onSuccess: () => {
      // The deepest activation signal there is: a school that books flights is a school
      // using the product. Tracked here rather than at the several forms that create a
      // booking, so the dispatch board, the self-serve form and a drag on the calendar
      // all count. PostHog dedupes nothing, so read this as "bookings created", and use
      // the funnel's first-occurrence semantics for "reached first booking".
      track("reservation_created");
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

/**
 * Edit an existing reservation. The server re-runs `validateReservationType` on
 * whatever body it receives, so this takes the COMPLETE reservation shape (same
 * as create) rather than a patch of changed fields, sending only `{end}` would
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
    mutationFn: ({
      id,
      reason,
      category,
      scope,
      acceptLateCancelFee,
    }: {
      id: number;
      reason?: string;
      category?: string;
      scope?: CancelScope;
      acceptLateCancelFee?: boolean;
    }) =>
      api<void>(`/reservations/${id}`, {
        method: "DELETE",
        body: {
          ...(reason ? { reason } : {}),
          ...(category ? { category } : {}),
          //Absent means just this one, which is what the server has always assumed.
          ...(scope && scope !== "this" ? { scope } : {}),
          ...(acceptLateCancelFee ? { acceptLateCancelFee: true } : {}),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reservations"] }),
  });
}

/**
 * The fixed list of cancellation reasons.
 *
 * Served rather than hardcoded so this and the app can never disagree with the report
 * about what the categories are. Cached hard, it changes on deploy, not during a session.
 */
export function useCancellationCategories() {
  return useQuery({
    queryKey: ["cancellation-categories"],
    queryFn: () => api<CancellationCategory[]>("/reports/cancellations/categories"),
    staleTime: Infinity,
  });
}

/**
 * Revenue grouped by a dimension. One query behind every revenue tab, pass a different
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
 * Ramp a reservation out, records the starting Hobbs/tach and marks the aircraft off the ramp.
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
 * Ramp a reservation in, records the ending Hobbs/tach (+ optional instruction time) and
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
 * Move an aircraft's home base. `POST /resources/:id/location` with `{ locationId }`.
 *
 * Only works when the org preference `updateResourceLocationOnRampIn` is on; otherwise
 * the server answers 403. Called from ramp-in before the meter readings, same order as
 * the iPhone app.
 */
export function useUpdateResourceLocation(resourceId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (locationId: number) =>
      api<Resource>(`/resources/${resourceId}/location`, {
        method: "POST",
        body: { locationId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

/**
 * Sign off a reservation's flight review with the caller's PIN.
 * `POST /reservations/:id/confirmReview` with `{ pin }`. When the final required pilot
 * confirms, the server auto-generates the invoice, so we invalidate invoices too.
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
 * Close out a guest reservation. `POST /reservations/:id/confirmReviewGuest`. No PIN: an
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

/**
 * Correct readings already recorded on a flight, via
 * `POST /reservations/:id/updateReviewTimes`.
 *
 * Rewriting a meter reading rewrites what the flight costs, so the server drops every
 * sign-off collected so far and the pilots confirm again.
 *
 * IT NO LONGER REFUSES ON COMPLETION, which is the whole point of the change: a solo
 * booking has one reviewer, and that reviewer is the person typing the reading in, so the
 * correction window used to shut on the same tap that opened it. LIVE MONEY is the lock now
 * (`409 RESERVATION_BILLED`; void the invoice or reverse the ledger charge and it reopens),
 * and clearing a sign-off that is not your own needs the school's staff (an admin or the
 * front desk) or the booking's instructor
 * (`403`). A body that merely echoes the stored figures writes nothing and comes back
 * `noChanges`.
 */
export function useCorrectReviewTimes(id: number) {
  const qc = useQueryClient();
  return useMutation({
    //`raw`, not `api`, because the actionable half of this response is the `meter` report
    //that sits BESIDE `data`: whether the aircraft's own Hobbs followed the correction, and
    //what it still reads if it did not. `api` unwraps to `data` and would drop it.
    mutationFn: async (input: CorrectReviewTimesInput) => {
      const { body } = await raw(`/reservations/${id}/updateReviewTimes`, { method: "POST", body: input });
      const envelope = (body ?? {}) as {
        data?: Reservation;
        meter?: {
          /** Did this correction touch a meter at all? False for a briefing-only fix. */
          changed?: boolean;
          followed?: boolean;
          aircraftHobbs?: number | null;
          aircraftTach?: number | null;
          unlatched?: { reminderId: number; name: string }[];
          /**
           * Inspections this reading no longer earns but that were deliberately LEFT
           * flagged, because their template also runs on a calendar clock. Somebody has to
           * clear those by hand.
           */
          notUnlatched?: { reminderId: number; name: string }[];
          /** The booking was corrected but the AIRCRAFT's meters could not be written. */
          writeFailed?: string | null;
        } | null;
        /** A guest booking's close-out flag was cleared, so it needs closing out again. */
        guestCloseOutCleared?: boolean;
        /**
         * The submitted figures already matched what was stored, so NOTHING was written and
         * no sign-off was cleared. This sheet is prefilled, so an unedited Save is a full
         * echo and lands here.
         */
        noChanges?: boolean;
        /** A `measured` split's per-person legs still describe the old hours. */
        splitLegsStale?: boolean;
      };
      //EVERY FIELD THE SERVER SENDS HAS TO SURVIVE THIS HOP. This function is the only
      //reason `raw` is used instead of `api`, and it was still dropping fields on the floor:
      //anything not named here simply never reaches the component, which is a silent,
      //type-clean way to lose a warning. `noChanges` went missing exactly that way, and the
      //console announced "Times corrected. The pilots will need to sign off again." on a
      //call that wrote nothing and cleared nobody.
      return {
        reservation: envelope.data ?? null,
        meter: envelope.meter ?? null,
        //`unlatched` rides inside `meter` and is read from there by the modal.
        guestCloseOutCleared: envelope.guestCloseOutCleared === true,
        noChanges: envelope.noChanges === true,
        splitLegsStale: envelope.splitLegsStale === true,
      };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      //The correction can move the aircraft's own Hobbs/tach when this is its latest flight.
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
      //A correction can un-latch an inspection reminder, so the maintenance surfaces move.
      void qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

/**
 * Reopen a closed-out booking so it can be corrected, via `POST /reservations/:id/reopen`.
 *
 * Takes the pilots' sign-offs back off the flight and nothing else: the readings, the crew
 * and the booked times are all left where they are. That is what makes the correction
 * endpoints reachable again on a booking everybody has already confirmed.
 *
 * Refused with 409 `RESERVATION_BILLED` while money still stands against the booking. The
 * caller shows that message as-is, because it names the specific way out (void the invoice,
 * or reverse the ledger charge) for the route the money actually took.
 *
 * `reason` is REQUIRED by the server and lands on the flight's audit record. It is the only
 * account of why a signature was removed, and "somebody reopened it" answers none of the
 * questions asked a year later.
 */
export function useReopenCloseOut(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) =>
      api<Reservation>(`/reservations/${id}/reopen`, { method: "POST", body: { reason } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/**
 * Price this one booking by hand, via `POST /reservations/:id/paymentOverrides`.
 *
 * The body is nested under `paymentOverrides`, which is the endpoint's own shape, not a
 * wrapper invented here: it answers 400 "You must include payment overrides" without it.
 *
 * Same consequence as a meter correction, and for the same reason: changing the cost voids
 * every PIN already entered.
 */
export function useOverrideReservationPayment(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paymentOverrides: ReservationPaymentOverridesInput) =>
      api<Reservation>(`/reservations/${id}/paymentOverrides`, {
        method: "POST",
        body: { paymentOverrides },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["audit"] });
    },
  });
}

/**
 * Raise the invoice for a flight that was closed out but never billed, via
 * `POST /reservations/:id/invoices`. Admin only, and the server checks that too.
 *
 * `raw` rather than `api`, for the same reason `useUpdateInvoice` uses it: a split booking
 * bills one payer at a time and the response carries `warnings` beside `data` when a share
 * was skipped or one payer's invoice failed while the rest went through. `api` unwraps to
 * `data` and would throw those away, which on this endpoint means telling a dispatcher
 * every student was billed when one was not.
 */
export function useCreateReservationInvoice(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { body } = await raw(`/reservations/${id}/invoices`, { method: "POST" });
      const envelope = (body ?? {}) as { data?: Invoice[]; warnings?: string[] };
      return { invoices: envelope.data ?? [], warnings: envelope.warnings ?? [] };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["revenue-report"] });
      // Ledger-mode posts flight_charges through this same endpoint.
      void qc.invalidateQueries({ queryKey: ["orgUsers"] });
      void qc.invalidateQueries({ queryKey: ["organizations", "ledger"] });
    },
  });
}

export function useCreatePlane() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePlaneResourceInput) =>
      api<Resource>("/resources", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] });
      //A new tail changes the AD readiness figures, and the settings panel is where a
      //school goes to see them. Its own key, so this does not refetch the world.
      void qc.invalidateQueries({ queryKey: ["ad-tracking"] });
    },
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] });
      //Editing an aircraft is how a serial number gets recorded, which is the one thing
      //that moves a tail from "model only" to "matched by serial" in AD settings. Without
      //this the panel you just fixed the aeroplane from still said it was missing.
      void qc.invalidateQueries({ queryKey: ["ad-tracking"] });
    },
  });
}

/**
 * Ground an aircraft, or return it to service.
 *
 * Its own endpoint, not `useUpdateResource`. The generic resource PATCH is admin-only, so
 * routing grounding through it is what made this a 403 for a technician, and why the
 * console simply hid the control from the one role built around maintenance.
 */
export function useSetResourceGrounding(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { grounded: boolean; reason?: string }) =>
      api<Resource>(`/resources/${id}/grounding`, { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resources"] }),
  });
}

export function useApproveResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      resourceId,
      userId,
      approve,
    }: {
      resourceId: number;
      userId: number;
      approve: boolean;
    }) =>
      api(`/resources/${resourceId}/${approve ? "approve" : "unapprove"}`, {
        method: "POST",
        body: { userId },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
      // Refresh the caller's bookable fleet (the /me/book "checked out" list)
      // so a just-approved student or renter sees the aircraft without a reload.
      void qc.invalidateQueries({ queryKey: ["approvedResources"] });
      // The other direction, the aircraft's own list of approved members.
      void qc.invalidateQueries({ queryKey: ["resourceApprovedUsers"] });
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
/** One page of pending join requests, for the People panel. */
export function useJoinRequestsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<JoinRequest>(["joinRequests"], "/joinRequests", paging, undefined, opts);
}

export function useAcceptJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    //`membershipPlanId` puts them on a plan in the same click, as `pending`: nothing is
    //charged until an admin starts it from their record. Best-effort on the server: a plan
    //that cannot be applied never un-accepts somebody.
    mutationFn: ({ id, role, membershipPlanId }: { id: number; role?: Role; membershipPlanId?: number }) =>
      api(`/joinRequests/${id}/accept`, {
        method: "POST",
        body: { ...(role ? { role } : {}), ...(membershipPlanId ? { membershipPlanId } : {}) },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["joinRequests"] });
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      void qc.invalidateQueries({ queryKey: ["membership"] });
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
      // No ["invitations"] invalidation: nothing in the console queries that key,
      // so it was invalidating a cache entry that never existed. The API does
      // have GET /invitations, a pending-invitations view would be a genuinely
      // useful thing to build on it, at which point this line comes back.
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

/** PATCH an invoice, mark paid (`{ paidAt }`), void (`{ voidedAt }`), edit memo. */
/**
 * One invoice, WITH its line items.
 *
 * The list endpoint doesn't select `items` (only the single-invoice endpoint does) so
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
 * Stripe as well as the row, and it records who did it. Sending `{ paidAt }`, which this
 * used to do, matched nothing, changed nothing, and still returned 200, so the UI showed
 * no error and the invoice silently stayed outstanding.
 */
export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    //`raw` rather than `api`: a partial success (our row changed, Stripe didn't) comes
    //back as a `warning` alongside `data`, and `api` unwraps to `data` and drops it.
    mutationFn: async ({ id, patch }: { id: number; patch: InvoiceUpdate }) => {
      const { body } = await raw(`/invoices/${id}`, { method: "PATCH", body: patch });
      const envelope = (body ?? {}) as {
        data?: Invoice;
        warning?: string;
        //Set only on a void that leaves a past, uncancelled reservation with nothing else
        //billed for it, see `useVoidInvoiceFlow`, which is what actually surfaces this.
        leavesUnbilled?: boolean;
        reservationId?: number;
      };
      return {
        invoice: envelope.data,
        warning: envelope.warning,
        leavesUnbilled: envelope.leavesUnbilled,
        reservationId: envelope.reservationId,
      };
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

/**
 * Create an airport or site (admin). The server GEOCODES the address through Google and
 * answers 400 "Address does not seem to be valid." when it cannot resolve it, so a real
 * street address is required, not decoration.
 *
 * `timeZone` is DROPPED here: `LocationService.create` never reads it, only `update`
 * does. Setting a zone at create time therefore takes a follow-up PATCH, which is what
 * the location form does.
 */
export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLocationInput) =>
      api<Location>("/locations", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });
}

/**
 * Edit an airport or site (admin). The whole address goes on every save, since the server
 * writes what it is sent. `timeZone: null` clears the zone back to the organization's, and
 * omitting `coordinates` leaves the stored position alone.
 */
export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateLocationInput & { id: number }) =>
      api<Location>(`/locations/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["locations"] });
      // The zone a booking is read in comes off its location, so the board is now stale.
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

/**
 * Remove an airport or site (admin) - 204, no body.
 *
 * This CASCADES on the server: the location is soft-deleted, every resource based there
 * is soft-deleted with it, and its reservations are cancelled with the reason "Location
 * was deleted". Invalidate the fleet and the board alongside the list, or the console
 * keeps drawing aircraft that no longer exist.
 */
export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/locations/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["locations"] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
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
 * Create a currency RULE. `gracePeriodDays` never existed on the server, the
 * real field is `warningPeriodInDays`, and the type carries expiration rules,
 * renewal rules, and three scope relations besides.
 *
 * ⚠️ Scope matters: a currency type with no `resourceGroupIds` matches no
 * aircraft in `orgUserIsCurrentForResource`, so it enforces nothing. The server
 * accepts it happily, it just does nothing.
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

/** One group WITH its resources, the list endpoint omits them. */
/** One page of aircraft groups, for the Settings table. */
export function useResourceGroupsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<ResourceGroup>(["groups", "resource"], "/groups/resource", paging, undefined, opts);
}

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

/** One group WITH its members, the list endpoint omits them. */
/** One page of people groups, for the Settings table. */
export function useOrgUserGroupsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<OrgUserGroup>(["groups", "orgUser"], "/groups/orgUser", paging, undefined, opts);
}

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

/** PATCH the current org, used for preferences (e.g. newOrgOnboardingComplete) and org fields. */
export function useUpdateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api<Organization>("/organizations/", { method: "PATCH", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organization"] }),
  });
}

/**
 * Schedule the organization for deletion in 30 days. Owner only.
 *
 * Returns `{ id, name, scheduledDeletionAt }`. The school stays usable until then;
 * callers should `rehydrate()` so the session picks up the countdown. The server
 * refuses while any invoice is unpaid, or if a countdown is already running.
 */
export function useDeleteOrganization() {
  return useMutation({
    mutationFn: () =>
      api<{ id: number; name: string; scheduledDeletionAt: string }>("/organizations/", {
        method: "DELETE",
      }),
  });
}

/**
 * Cancel a scheduled organization deletion. Admin (and owner) only.
 *
 * Returns the org with `scheduledDeletionAt: null`. Caller should `rehydrate()`.
 */
export function useCancelOrganizationDeletion() {
  return useMutation({
    mutationFn: () =>
      api<{ id: number; name: string; scheduledDeletionAt: string | null }>(
        "/organizations/cancelDeletion",
        { method: "POST" }
      ),
  });
}

/**
 * Leave a school you belong to. `POST /organizations/leave/:orgId`.
 *
 * The server refuses when you are the sole admin or sole owner. The session stays pinned
 * to the org you left until the caller signs out or switches, so callers must do one of
 * those next. Demo sessions cannot leave (demoGuard).
 */
export function useLeaveOrganization() {
  return useMutation({
    mutationFn: (orgId: number) =>
      api<void>(`/organizations/leave/${orgId}`, { method: "POST" }),
  });
}

/** Setup-checklist state: the marketing source the org signed up from and what it
 *  has waved off. Whether an item is DONE is derived from real data, not stored.
 *  see `lib/onboarding-checklist.ts`. Admin-only on the server. */
export function useOrgOnboarding(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["organization", "onboarding"],
    queryFn: () => api<OrgOnboarding>("/organizations/onboarding"),
    ...opts,
  });
}

/**
 * Whether this school may turn multi-day bookings on, and what to set first if not.
 *
 * Fetched so the toggle can explain itself BEFORE anybody clicks it. The same rule is
 * enforced on the PATCH, so this is the explanation and not the gate: a stale answer here
 * cannot let the setting through.
 */
export function useMultiDayReadiness(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["organization", "multiDayReadiness"],
    queryFn: () => api<MultiDayReadiness>("/organizations/multiDayReadiness"),
    ...opts,
  });
}

export function useUpdateOrgOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { dismissedItems?: string[]; dismissedAt?: string | null }) =>
      api<OrgOnboarding>("/organizations/onboarding", { method: "PATCH", body: patch }),
    // Seed rather than refetch: the response is the new state.
    onSuccess: (saved) => qc.setQueryData(["organization", "onboarding"], saved),
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

/**
 * Retire a member from the roster, or bring them back.
 *
 * Its own endpoint rather than a key on the member PATCH above, and deliberately so:
 * that PATCH carries the whole member record on every save, which is how the grounding
 * email came to re-fire on edits that changed nothing. Archiving is a verb, not a field.
 *
 * Owner/admin only, server-side, a dispatcher gets a 403.
 */
export function useSetMemberArchived(userId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (archived: boolean) =>
      api<User>(`/users/${userId}/orgUser/archive`, { method: "PATCH", body: { archived } }),
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
/** Open Stripe's billing portal, where a card is added or replaced.
 *
 *  The endpoint existed for months and nothing called it, which is why a school whose
 *  payment failed had no way to fix it from the console. */
export function useBillingPortal() {
  return useMutation({
    mutationFn: (body: { returnUrl?: string } = {}) =>
      api<{ url: string }>("/subscription/portal", { method: "POST", body }),
  });
}

export function useSubscriptionCheckout() {
  return useMutation({
    mutationFn: (body: { successUrl?: string; cancelUrl?: string } = {}) =>
      api<{ url: string }>("/subscription/checkout", { method: "POST", body }),
  });
}

// ---------------------------------------------------------------- billing terms (internal)
//
// The developer-only view of what a school pays us. Everything here is behind
// `isDeveloper()` server-side; the console gates the route as well, but only for
// tidiness. See server services/billing-terms.ts.

export type BillingTerms = {
  id: number;
  model: string;
  unitPriceCents: number | null;
  freeUnits: number;
  discountPercent: number;
  discountEndsAt: string | null;
  feeRateBasis: number | null;
  freeUntil: string | null;
  freeUntilReason: string | null;
  notes: string | null;
  updatedAt: string;
  FK_organizationId: number;
};

export type PricedTerms = {
  model: string;
  state: string;
  blocked: boolean;
  unitCount: number;
  billableUnits: number;
  freeUnits: number;
  discountPercent: number;
  unitPriceCents: number;
  monthlyCents: number;
  freeUntil: string | null;
  freeUntilReason: string | null;
  daysLeft: number;
  feeRateBasis: number;
  unitLabel: string;
};

export type BillingTermsChange = {
  id: number;
  createdAt: string;
  changedBy: string;
  reason: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
};

export type BillingTermsRow = BillingTerms & {
  organization: { id: number; name: string; code: string; isDemo: boolean };
};

/** Every school not on plain standard pricing, plus what we are giving away. */
export function useBillingTermsOverview(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["developer", "billing-terms"],
    queryFn: () =>
      api<{ rows: BillingTermsRow[]; comped: { orgs: number; units: number; cents: number } }>(
        "/developer/billing-terms"
      ),
    ...opts,
  });
}

/** One school: its terms, what they currently price to, and the change history. */
export function useOrgBillingTerms(orgId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["developer", "billing-terms", orgId],
    queryFn: () =>
      api<{
        orgId: number;
        organization: { id: number; name: string; code: string; createdAt: string; isDemo: boolean; plan: string };
        terms: BillingTerms | null;
        priced: PricedTerms;
        changes: BillingTermsChange[];
      }>(`/developer/billing-terms/${orgId}`),
    enabled: orgId != null,
    ...opts,
  });
}

export type OrgDirectoryRow = {
  id: number;
  name: string;
  code: string;
  createdAt: string;
  isDemo: boolean;
  plan: string;
  memberCount: number;
  aircraftCount: number;
  lastActiveAt: string | null;
  priced: PricedTerms;
};

export type OrgMemberRow = {
  orgUserId: number;
  userId: number;
  name: string;
  email: string;
  emailVerifiedAt: string | null;
  lastActiveAt: string | null;
  archivedAt: string | null;
  roles: string[];
};

/**
 * The organization directory, paged and searched ON THE SERVER.
 *
 * `q` is part of the query key rather than a client-side filter for the reason
 * lib/paging.ts spells out: narrowing the twenty-five rows this page happens to be
 * holding and labelling it "the schools matching Chicago" is wrong in a way nobody
 * looking at the screen can detect.
 */
export function useDeveloperOrganizations(
  params: { q?: string; kind?: string; model?: string; blockedOnly?: boolean; limit: number; offset: number },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["developer", "organizations", params],
    queryFn: () =>
      api<{ rows: OrgDirectoryRow[]; total: number; hasMore: boolean }>(
        `/developer/organizations/search?${new URLSearchParams({
          ...(params.q ? { q: params.q } : {}),
          ...(params.kind && params.kind !== "all" ? { kind: params.kind } : {}),
          ...(params.model && params.model !== "all" ? { model: params.model } : {}),
          ...(params.blockedOnly ? { blockedOnly: "true" } : {}),
          limit: String(params.limit),
          offset: String(params.offset),
        }).toString()}`
      ),
    ...opts,
  });
}

/** One school's people, for the organization detail page. */
export function useDeveloperOrgMembers(
  orgId: number | null,
  params: { q?: string; limit: number; offset: number },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["developer", "organizations", orgId, "members", params],
    queryFn: () =>
      api<{ rows: OrgMemberRow[]; total: number; hasMore: boolean }>(
        `/developer/organizations/${orgId}/members?${new URLSearchParams({
          ...(params.q ? { q: params.q } : {}),
          limit: String(params.limit),
          offset: String(params.offset),
        }).toString()}`
      ),
    enabled: orgId != null,
    ...opts,
  });
}

/** Change a school's terms. `reason` is required by the server, not just by the form. */
export function useSetBillingTerms(orgId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<BillingTerms>(`/developer/billing-terms/${orgId}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["developer", "billing-terms"] });
      // The signed-in developer may be looking at this very school's plan page.
      void qc.invalidateQueries({ queryKey: ["subscription"] });
    },
  });
}

// ---------------------------------------------------------------- member self-pay (Stripe)

/**
 * Everything the Payment Element needs to charge one invoice (`GET /stripe/invoice/:id`):
 * a PaymentIntent client secret + the connected account it lives on. Errors (org not billing-
 * enabled, already paid, no Stripe intent) surface as ApiError for the caller to show.
 * Not cached, a fresh client secret per open, and never retried (a 4xx here is terminal).
 */
export function useInvoicePaymentIntent(invoiceId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["stripe", "invoice", invoiceId],
    queryFn: () => api<InvoicePaymentIntent>(`/stripe/invoice/${invoiceId}`),
    enabled: (opts?.enabled ?? true) && invoiceId != null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    // Don't refetch while the member is entering their card, that would swap the client
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
 * The member's own billing settings, autopay + Stripe customer (`GET /orgUsers/billing`).
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

/** Member account ledger + balance (`GET /orgUsers/:id/ledger`). Self or admin. */
export function useMemberLedger(orgUserId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger"],
    queryFn: () => api<MemberLedger>(`/orgUsers/${orgUserId}/ledger`),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
    ...opts,
  });
}

export type LedgerListFilter = {
  q?: string;
  type?: string | string[];
  startDate?: string;
  endDate?: string;
};

/** One page of a member's ledger entries, for the /me Billing table. */
export function useMemberLedgerPage(
  orgUserId: number | null,
  filter: LedgerListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger", { ...(filter ?? {}), ...paging.query }],
    queryFn: async (): Promise<
      Paged<LedgerEntry> & { balanceCents: number; ledgerEnabled: boolean }
    > => {
      const body = await apiRaw<{
        data?: MemberLedger;
        pagination?: PaginationMeta;
      }>(`/orgUsers/${orgUserId}/ledger`, {
        query: { ...(filter ?? {}), ...paging.query },
      });
      const data = body.data;
      const pagination = body.pagination;
      const rows = data?.entries ?? [];
      return {
        rows,
        total: pagination?.total ?? rows.length,
        hasMore: pagination?.hasMore ?? false,
        balanceCents: data?.balanceCents ?? 0,
        ledgerEnabled: data?.ledgerEnabled === true,
      };
    },
    enabled: (opts?.enabled ?? true) && orgUserId != null,
    placeholderData: (prev) => prev,
    ...opts,
  });
}

/** Inclusive period statement (`GET /orgUsers/:id/ledger/statement`). */
export function useMemberLedgerStatement(
  orgUserId: number | null,
  range: { start: string; end: string } | null,
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger", "statement", range?.start, range?.end],
    queryFn: () =>
      api<LedgerStatement>(`/orgUsers/${orgUserId}/ledger/statement`, {
        query: { start: range!.start, end: range!.end },
      }),
    enabled: (opts?.enabled ?? true) && orgUserId != null && range != null,
    ...opts,
  });
}

export function useEmailLedgerStatement(orgUserId: number | null) {
  return useMutation({
    mutationFn: (body: { start: string; end: string; periodLabel?: string }) =>
      api<{ sent: boolean; to: string }>(`/orgUsers/${orgUserId}/ledger/statement/email`, {
        method: "POST",
        body,
      }),
  });
}

/** Refundable top-ups for the desk Refund UI. */
export function useLedgerRefundable(orgUserId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["orgUsers", orgUserId, "ledger", "refundable"],
    queryFn: () => api<LedgerRefundable>(`/orgUsers/${orgUserId}/ledger/refundable`),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
    ...opts,
  });
}

/** Start a card top-up PaymentIntent (`POST /orgUsers/:id/ledger/topups`). */
export function useCreateLedgerTopUp(orgUserId: number | null) {
  return useMutation({
    mutationFn: (body: { amountCents: number; paymentMethodId?: string; idempotencyKey?: string }) =>
      api<LedgerTopUpIntent>(`/orgUsers/${orgUserId}/ledger/topups`, { method: "POST", body }),
  });
}

/** Credit a Stripe.js-confirmed top-up without waiting on the webhook. */
export function useConfirmLedgerTopUp(orgUserId: number | null) {
  return useMutation({
    mutationFn: (body: { paymentIntentId: string }) =>
      api<LedgerTopUpConfirm>(`/orgUsers/${orgUserId}/ledger/topups/confirm`, {
        method: "POST",
        body,
      }),
  });
}

/** Home balance, member ledger pages, and school-wide accounts roster. */
export function invalidateLedgerMoney(
  qc: ReturnType<typeof useQueryClient>,
  balanceCents?: number
) {
  if (typeof balanceCents === "number") {
    qc.setQueryData<OrgUserBillingSettings>(["orgUsers", "billing"], (old) =>
      old ? { ...old, balanceCents } : old
    );
    qc.setQueriesData<{ balanceCents?: number }>(
      {
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "orgUsers" &&
          q.queryKey[2] === "ledger" &&
          typeof q.queryKey[3] !== "string",
      },
      (old) => (old && typeof old === "object" ? { ...old, balanceCents } : old)
    );
  }
  return Promise.all([
    qc.invalidateQueries({ queryKey: ["orgUsers"] }),
    qc.invalidateQueries({ queryKey: ["ledger"] }),
    qc.invalidateQueries({ queryKey: ["stripe", "paymentMethods"] }),
  ]);
}

/** Admin cash/check/other credit or adjustment. */
export function usePostLedgerEntry(orgUserId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amountCents: number;
      type: "cash" | "check" | "other" | "adjustment";
      memo: string;
    }) =>
      api<{ balanceCents: number; entry: LedgerEntry }>(`/orgUsers/${orgUserId}/ledger/entries`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "ledger"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", "billing"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "billing"] });
    },
  });
}

/** Desk refund (Stripe or check/cash). */
export function usePostLedgerRefund(orgUserId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amountCents: number;
      method: "stripe" | "check_cash";
      memo: string;
      topupEntryId?: number;
      idempotencyKey?: string;
    }) =>
      api<{ balanceCents: number; entry: LedgerEntry }>(`/orgUsers/${orgUserId}/ledger/refunds`, {
        method: "POST",
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "ledger"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", "billing"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "billing"] });
    },
  });
}

/** Reassign a flight_charge to another member (admin). */
export function useReassignLedgerFlightCharge(orgUserId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entryId: number; toOrgUserId: number; memo?: string }) =>
      api<{
        reversal: LedgerEntry;
        entry: LedgerEntry;
        fromBalanceCents: number;
        toBalanceCents: number;
      }>(`/orgUsers/${orgUserId}/ledger/entries/${body.entryId}/reassign`, {
        method: "POST",
        body: { toOrgUserId: body.toOrgUserId, memo: body.memo },
      }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "ledger"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", vars.toOrgUserId, "ledger"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", "billing"] });
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

/**
 * Reverse a flight charge, which is what unlocks the flight behind it (admin).
 *
 * THE LEDGER'S COUNTERPART TO VOIDING AN INVOICE. Correcting a recorded reading is refused
 * while live money stands against the booking, and at a ledger school the charge posts by
 * itself the moment the last pilot enters their PIN, so the booking locks on the same tap
 * that finishes it. The product told schools to "reverse the ledger charge on the member's
 * billing tab" and there was no such action anywhere, which meant the whole reopen feature
 * did nothing for them: the only move left was still to abandon the booking and re-create
 * it carrying the real hours, the exact bug it was built to fix.
 *
 * Invalidates `reservations` as well as the ledger, because a booking that was locked is
 * now correctable and its buttons have to come back without a reload.
 */
export function useReverseLedgerFlightCharge(orgUserId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { entryId: number; memo?: string }) =>
      api<{ entry: LedgerEntry; balanceCents: number }>(
        `/orgUsers/${orgUserId}/ledger/entries/${body.entryId}/reverse`,
        { method: "POST", body: { memo: body.memo } }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "ledger"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", "billing"] });
      void qc.invalidateQueries({ queryKey: ["orgUsers", orgUserId, "billing"] });
      void qc.invalidateQueries({ queryKey: ["reservations"] });
    },
  });
}

/** Start a card SetupIntent so the member can save a card (`POST /stripe/setupIntent`). */
/** One page of the caller's saved cards. */
export function usePaymentMethodsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<PaymentMethod>(["paymentMethods"], "/stripe/paymentMethods", paging, undefined, opts);
}

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

/** One page of a member's invoices, for the My invoices table. */
export function useMemberInvoicesPage(
  orgUserId: number | null,
  filter: InvoiceListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<Invoice>(
    ["invoices", "member", orgUserId],
    `/invoices/orgUsers/${orgUserId}`,
    paging,
    filter,
    { enabled: (opts?.enabled ?? true) && orgUserId != null }
  );
}

/** One member's invoice totals. `GET /invoices/orgUsers/:id/summary`. */
export function useMemberInvoiceSummary(
  orgUserId: number | null,
  filter?: { startDate?: string; endDate?: string; q?: string },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["invoices", "member", orgUserId, "summary", filter ?? {}],
    queryFn: () =>
      api<{ revenue: number; paidCount: number; outstanding: number; outstandingCount: number }>(
        `/invoices/orgUsers/${orgUserId}/summary`,
        { query: filter }
      ),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
  });
}

/** One page of the caller's currencies, for the My currencies table. */
export function useMyCurrenciesPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Currency>(["currencies", "me"], "/currencies", paging, undefined, opts);
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
 * type. There is no "list by orgUser" endpoint, the desk surface fans out
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
  // Flatten once results settle, ids are unique across types.
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
      void qc.invalidateQueries({ queryKey: ["currencyTypes", "detail"] });
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
 * Who is checked out on one aircraft.
 *
 * One request. This used to invert the relation client-side, fetch every
 * renter, then ask each of them what they were approved for: which cost a
 * request per member and so had to stop at the first 60 and tell the school its
 * list might be incomplete. `GET /resources/:id/approvedUsers` reads the
 * relation in this direction, so the answer is now whole at any roster size.
 *
 * Students and renters, the roles the approval gate holds to the list.
 * Instructors, admins and dispatchers can already book any tail, so they are
 * omitted even if somebody recorded a checkout against them.
 */
export function useResourceApprovedPilots(resourceId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resourceApprovedUsers", resourceId],
    queryFn: () =>
      api<OrganizationUser[]>(`/resources/${resourceId}/approvedUsers`, {
        query: { student: true, renter: true },
      }),
    enabled: (opts?.enabled ?? true) && resourceId != null,
  });
}

/**
 * How many students and renters the org has, without pulling the roster.
 *
 * Used to tell "nobody is approved on this tail" apart from "this school has
 * nobody the gate applies to yet", two empty lists that need different advice.
 * Asks for a single row and reads the total off the pagination envelope.
 */
export function useCheckoutRosterCount(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["members", "checkoutRosterCount"],
    queryFn: async () => {
      const { pagination } = await apiList<OrganizationUser>("/orgUsers", {
        query: { student: true, renter: true, limit: 1 },
      });
      return pagination.total;
    },
    ...opts,
  });
}

/**
 * Who this user is paired with for instruction, their assigned students (if
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

/** @deprecated Prefer useUserInstructionPartners, same query key `/me` already uses. */
export function useMyInstructionPartners(userId: number | null, opts?: QueryOpts) {
  return useUserInstructionPartners(userId, opts);
}

/** Admin assign pair, ids are Student / Instructor role PKs. */
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
      // The People panel reads the paged copies under a different key.
      void qc.invalidateQueries({ queryKey: ["pairRequests"] });
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
      // The People panel reads the paged copies under a different key.
      void qc.invalidateQueries({ queryKey: ["pairRequests"] });
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

/** One page of pending student-pair requests, for the People panel. */
export function useStudentPairRequestsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<InstructionPairRequest>(["pairRequests", "students"], "/students/requests", paging, undefined, opts);
}

/** One page of pending instructor-pair requests, for the People panel. */
export function useInstructorPairRequestsPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<InstructionPairRequest>(["pairRequests", "instructors"], "/instructors/requests", paging, undefined, opts);
}

export function useRespondStudentPairRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "accept" | "decline" }) =>
      api(`/students/requests/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["instructionRequests"] });
      // The People panel reads the paged copies under a different key.
      void qc.invalidateQueries({ queryKey: ["pairRequests"] });
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
      // The People panel reads the paged copies under a different key.
      void qc.invalidateQueries({ queryKey: ["pairRequests"] });
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
// These endpoints return the INVERSE of existing reservations, free windows
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
 * Free windows for each user (keyed by USER id, not org-user id), one query per
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

/**
 * How many notifications are unread.
 *
 * Asks for a single row and reads `pagination.total`, rather than counting the
 * unread ones in the list on screen, that list is one page, so the count would
 * shrink as you paged forward. Cheap enough to be worth the extra request: the
 * response is one notification, and the number is a real count of the whole set.
 */
export function useUnreadNotificationCount(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["notifications", "unreadCount"],
    queryFn: async () => {
      const { pagination } = await apiList<AppNotification>("/notifications", {
        query: { status: "unread", limit: 1 },
      });
      return pagination.total;
    },
    ...opts,
  });
}

/** One page of notifications, for the Notifications table. */
export function useNotificationsPage(
  filter: NotificationListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<AppNotification>(["notifications"], "/notifications", paging, filter, opts);
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

//---------------------------------------------------------------------------------
// Contact details and emergency contacts.
//
// One route family on the server keyed by user id, for your own record and somebody
// else's alike, so these hooks all take a `userId` and the caller passes its own for
// self-service. Who is actually allowed is decided server-side; a 403 here is a real
// answer, not a bug.
//
// Everything invalidates BOTH the contact keys and the member keys, because a member's
// phone rides along on `GET /orgUsers/{id}` for the profile header, editing a number
// and watching the header keep the old one is the bug this prevents.
//---------------------------------------------------------------------------------

/** A person's contact record. Absent (403) when the caller may not see it. */
export function useContactDetails(userId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["contactDetails", userId],
    queryFn: () => api<UserDetails | null>(`/users/${userId}/details`),
    enabled: (opts?.enabled ?? true) && userId != null,
    ...opts,
  });
}

export interface ContactDetailsInput {
  phone?: string | null;
  homePhone?: string | null;
  workPhone?: string | null;
  dateOfBirth?: string | null;
  preferredName?: string | null;
}

export function useUpdateContactDetails(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactDetailsInput) =>
      api<UserDetails>(`/users/${userId}/details`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contactDetails", userId] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useEmergencyContacts(userId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["emergencyContacts", userId],
    queryFn: () => api<EmergencyContact[]>(`/users/${userId}/emergencyContacts`),
    enabled: (opts?.enabled ?? true) && userId != null,
    ...opts,
  });
}

export interface EmergencyContactInput {
  name?: string;
  relationship?: string | null;
  phone?: string;
  altPhone?: string | null;
  email?: string | null;
  notes?: string | null;
  isPrimary?: boolean;
}

export function useSaveEmergencyContact(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    // One hook for add and edit: the form is identical and the only difference is
    // whether an id came with it.
    mutationFn: ({ id, ...body }: EmergencyContactInput & { id?: number }) =>
      id == null
        ? api<EmergencyContact>(`/users/${userId}/emergencyContacts`, { method: "POST", body })
        : api<EmergencyContact>(`/users/${userId}/emergencyContacts/${id}`, {
            method: "PATCH",
            body,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergencyContacts", userId] });
      qc.invalidateQueries({ queryKey: ["contactDetails", userId] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useDeleteEmergencyContact(userId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api(`/users/${userId}/emergencyContacts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["emergencyContacts", userId] });
      qc.invalidateQueries({ queryKey: ["contactDetails", userId] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
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

/**
 * One metric about ONE member. `GET /reports/orgUser/:orgUserId/:metric`.
 *
 * The server serves these to that member or to an admin, and nobody else. That
 * rule is the whole reason the person page can show a student their own hours
 * and money without an admin-only route: pass `enabled` from the caller's own
 * `isAdmin || isSelf`, and a dispatcher simply never asks.
 *
 * Metrics: countFlightTime, countInstructionTimeGiven, countInstructionTimeReceived,
 * countScheduledReservations, countCompletedReservations, countPendingAndProcessedPayments.
 * All are deci-hours or cents, divide at the edge, never in the middle.
 */
export function useOrgUserReport<T>(
  orgUserId: number | null,
  metric: string,
  range?: ReportRange,
  opts?: QueryOpts & { rangeRequired?: boolean }
) {
  const rangeRequired = opts?.rangeRequired ?? true;
  return useQuery({
    queryKey: ["reports", "orgUser", orgUserId, metric, range ?? {}],
    queryFn: () =>
      api<T>(`/reports/orgUser/${orgUserId}/${metric}`, {
        query: range ? { startDate: range.startDate, endDate: range.endDate } : undefined,
      }),
    enabled:
      (opts?.enabled ?? true) && orgUserId != null && (!rangeRequired || range != null),
  });
}

/**
 * One metric about ONE aircraft. `GET /reports/resource/:resourceId/:metric`.
 *
 * Two access tiers server-side, and they are not interchangeable: utilization,
 * bookings and squawk counts go to admin, dispatcher and technician, while
 * `countPendingAndProcessedPayments` stays admin-only. Gate the money tiles on
 * `isAdmin` at the call site, asking anyway is a 403, not an empty card.
 */
export function useResourceReport<T>(
  resourceId: number | null,
  metric: string,
  range?: ReportRange,
  opts?: QueryOpts & { rangeRequired?: boolean }
) {
  const rangeRequired = opts?.rangeRequired ?? true;
  return useQuery({
    queryKey: ["reports", "resource", resourceId, metric, range ?? {}],
    queryFn: () =>
      api<T>(`/reports/resource/${resourceId}/${metric}`, {
        query: range ? { startDate: range.startDate, endDate: range.endDate } : undefined,
      }),
    enabled:
      (opts?.enabled ?? true) && resourceId != null && (!rangeRequired || range != null),
  });
}

/**
 * One aircraft, by id (`GET /resources/:id`, any member).
 *
 * The detail page can't rely on finding its tail inside a list read: the fleet
 * list is paged and filtered, so a deep link to page 3 of the fleet would show a
 * "not found" for an aircraft that exists.
 */
export function useResource(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["resources", "one", id],
    queryFn: () => api<Resource>(`/resources/${id}`),
    enabled: (opts?.enabled ?? true) && id != null,
  });
}

/**
 * One member's roster row, by org-user id (`GET /orgUsers/:id`, any member).
 *
 * Same reason as `useResource`: the person page is deep-linkable and the roster
 * it would otherwise be found in is paged and filtered, so resolving the person
 * out of a list read would 404 anyone who happens to be on page 2.
 */
export function useMember(orgUserId: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["members", "one", orgUserId],
    queryFn: () => api<OrganizationUser>(`/orgUsers/${orgUserId}`),
    enabled: (opts?.enabled ?? true) && orgUserId != null,
  });
}

// ---------------------------------------------------------------- documents

//---------------------------------------------------------------------------------
// API keys.
//
// Session-only by design: the server refuses these four routes to an API key,
// even one holding the admin role, so a leaked key can never issue itself
// replacements. That means this console is the only place they can be managed,
// which is why this tab exists.
//---------------------------------------------------------------------------------

/** Every key in the org (`GET /apiKeys`). Never includes secrets. */
export function useApiKeys(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["apiKeys"],
    queryFn: () => api<ApiKey[]>("/apiKeys"),
    ...opts,
  });
}

/**
 * Mint a key (admin only).
 *
 * The response is the ONLY time the secret exists outside the caller's hands.
 * the server keeps a hash, so the caller must show it immediately and must not
 * discard it on error paths.
 */
/** One page of API keys, for the Settings table. */
export function useApiKeysPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<ApiKey>(["apiKeys"], "/apiKeys", paging, undefined, opts);
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ApiKeyInput) =>
      api<ApiKeyWithSecret>("/apiKeys", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apiKeys"] }),
  });
}

/** Revoke a key. Takes effect on the next request; the row stays, marked revoked. */
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/apiKeys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apiKeys"] }),
  });
}

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
/** One page of document types, for the Settings table. */
export function useDocumentTypesPage(paging: PagingState, opts?: QueryOpts) {
  return usePagedList<DocumentType>(["documentTypes"], "/userDocuments/types", paging, undefined, opts);
}

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

/** Soft-delete a document type (admin only): 204, no body. Filed documents survive. */
export function useDeleteDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<void>(`/userDocuments/types/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documentTypes"] }),
  });
}

/** A member's documents (self, or admin viewing another). `GET /userDocuments/orgUsers/:id`. */
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
 * `orgUserId` files the document against another member instead of the caller, the server
 * requires the caller to be an org admin to do that, and 403s otherwise. Send it as a number:
 * the route compares it to the caller's own id with `!==`, so a numeric string would take the
 * on-behalf-of branch even when it names the caller.
 */
/** One page of a member's documents, for the Documents table. */
export function useMemberDocumentsPage(
  orgUserId: number | null,
  filter: DocumentListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<UserDocument>(
    ["documents", orgUserId],
    `/userDocuments/orgUsers/${orgUserId}`,
    paging,
    filter,
    { enabled: (opts?.enabled ?? true) && orgUserId != null }
  );
}

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

/** One page of squawks, for the Maintenance table. */
export function useSquawksPage(filter: SquawkListFilter | undefined, paging: PagingState, opts?: QueryOpts) {
  return usePagedList<Squawk>(["squawks"], "/maintenance/squawks", paging, filter, opts);
}

/**
 * One squawk, in full, for the record page a notification deep-links to.
 *
 * Carries more than the list rows do: `notes`, plus the `resolvedBy` / `verifiedBy` people
 * behind the two stamps. Keyed under `["squawks", id]` so every squawk mutation's existing
 * `["squawks"]` invalidation reaches it by prefix, and a page open on a squawk somebody
 * just verified refreshes without anyone remembering to add a key.
 */
export function useSquawk(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["squawks", id],
    queryFn: () => api<Squawk>(`/maintenance/squawks/${id}`),
    enabled: id != null,
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
 * `resolve` REQUIRES `completedAt`: when the work was actually finished, which
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

/**
 * Add a note to a squawk.
 *
 * Append-only, matching the server: there is no edit and no delete, and a mistake is
 * corrected by writing another note. Invalidating `["squawks"]` reaches the record page's
 * `["squawks", id]` by prefix, so the thread redraws with the server's own copy rather than
 * one this client assembled.
 */
export function useAddSquawkComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      api<SquawkComment>(`/maintenance/squawks/${id}/comments`, {
        method: "POST",
        body: { body: body.trim() },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["squawks"] });
    },
  });
}

/** One page of maintenance reminders, for the Maintenance table. */
export function useMaintenanceRemindersPage(
  filter: ReminderListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<MaintenanceReminder>(["reminders"], "/maintenance/reminders", paging, filter, opts);
}

export function useMaintenanceReminders(filter?: ReminderListFilter, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reminders", filter ?? {}],
    queryFn: () => api<MaintenanceReminder[]>("/maintenance/reminders", { query: filter }),
    ...opts,
  });
}

/**
 * What is holding ONE aircraft down, fetched on demand rather than subscribed to.
 *
 * The aircraft record can hold the two queries open because it is looking at a single tail.
 * The fleet list cannot: it would mean two extra requests per grounded row, for an answer
 * nobody needs until they actually reach for "Return to service". Same query keys as the
 * hooks above, so whichever surface asks first warms the cache for the other.
 */
export async function fetchResourceHolds(qc: QueryClient, resourceId: number): Promise<string[]> {
  const squawkFilter: SquawkListFilter = { resourceId, resolved: false };
  const reminderFilter: ReminderListFilter = { resourceId, resolved: false };
  const [squawks, reminders] = await Promise.all([
    qc.fetchQuery({
      queryKey: ["squawks", squawkFilter],
      queryFn: () => api<Squawk[]>("/maintenance/squawks", { query: squawkFilter }),
    }),
    qc.fetchQuery({
      queryKey: ["reminders", reminderFilter],
      queryFn: () => api<MaintenanceReminder[]>("/maintenance/reminders", { query: reminderFilter }),
    }),
  ]);
  return outstandingHolds({ reminders, squawks });
}

/** The rules behind the reminders, one template spanning many aircraft. */
/**
 * The compliance log: every inspection this school has signed off.
 *
 * Paged server-side like every other collection. This one grows for the life of every
 * aircraft rather than settling at one row per rule, so a client that renders "everything it
 * was given" would be showing a truncated log confidently.
 *
 * There is deliberately NO create, update or delete hook here. A record is written by
 * signing a reminder off, and it is append-only: if a mutation hook existed, that would be
 * the bug.
 */
/**
 * Your own mechanic certificate, stated once so sign-off can prefill it.
 *
 * Self-scoped: the endpoint takes no id and writes only the caller's membership, so this
 * cannot be pointed at somebody else. An empty string clears one entered wrongly.
 */
export function useUpdateMechanicCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { mechanicCertificateNumber: string; mechanicCertificateType: string }) =>
      api<{ mechanicCertificateNumber: string | null; mechanicCertificateType: string | null }>(
        "/users/mechanicCertificate",
        { method: "PATCH", body }
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["people"] });
    },
  });
}

export function useComplianceRecordsPage(
  filter: ComplianceListFilter | undefined,
  paging: PagingState,
  opts?: QueryOpts
) {
  return usePagedList<MaintenanceComplianceRecord>(
    ["compliance-records"],
    "/maintenance/compliance",
    paging,
    filter,
    opts
  );
}

/** One record, for a deep link from a report row. Keyed under the list prefix so list
 *  invalidation reaches it without anyone remembering to add a key. */
export function useComplianceRecord(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["compliance-records", id],
    queryFn: () => api<MaintenanceComplianceRecord>(`/maintenance/compliance/${id}`),
    enabled: id != null,
    ...opts,
  });
}

export function useMaintenanceReminderTemplates(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reminder-templates"],
    queryFn: () => api<MaintenanceReminderTemplate[]>("/maintenance/reminders/templates"),
    ...opts,
  });
}

/** One template, including which aircraft it's on and where each of them stands. */
export function useMaintenanceReminderTemplate(id: number | null, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["reminder-templates", id],
    queryFn: () => api<MaintenanceReminderTemplate>(`/maintenance/reminders/templates/${id}`),
    enabled: id != null,
    ...opts,
  });
}

/**
 * The AVIATES inspections, ready to apply.
 *
 * Fetched rather than hard-coded so the regulation text and intervals match the mobile
 * app's exactly. Long `staleTime`: it's static reference data, not a record.
 */
export function useInspectionPresets(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["inspection-presets"],
    queryFn: () => api<InspectionPreset[]>("/maintenance/reminders/presets"),
    staleTime: 60 * 60 * 1000,
    ...opts,
  });
}

/**
 * Change which aircraft a template applies to, or rename it.
 *
 * `templateResources` is a PUT, not a PATCH, send the complete list of aircraft the
 * template should end up on. Omitting a tail DETACHES it and deletes its unresolved
 * reminder, so never send a partial list thinking it will merge.
 */
export function useUpdateMaintenanceReminderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: number } & Partial<CreateReminderTemplateInput>) =>
      api<MaintenanceReminderTemplate>(`/maintenance/reminders/templates/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reminders"] });
      void qc.invalidateQueries({ queryKey: ["reminder-templates"] });
      void qc.invalidateQueries({ queryKey: ["resource"] });
    },
  });
}

export function useDeleteMaintenanceReminderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/maintenance/reminders/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reminders"] });
      void qc.invalidateQueries({ queryKey: ["reminder-templates"] });
      void qc.invalidateQueries({ queryKey: ["resource"] });
    },
  });
}

/**
 * Sign a reminder off as done.
 *
 * POST rather than PATCH, for historical reasons the server documents. `completedHours` is
 * DECI-hours and is what the NEXT interval counts from: send the meter reading the work
 * was actually done at, not today's, or the new interval starts short.
 */
/**
 * Sign a reminder off, and optionally write the permanent compliance record.
 *
 * The compliance half is optional TOGETHER: send `methodOfCompliance` and `mechanicName`
 * and the server writes a 14 CFR 91.417 entry that can never be edited or removed; send
 * neither and the reminder rolls forward exactly as it always has. An oil change should not
 * have to name a certificate holder.
 */
export function useResolveMaintenanceReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: number;
      completedAt: string;
      completedHours?: number;
      notes?: string;
      methodOfCompliance?: string;
      mechanicName?: string;
      mechanicCertificateNumber?: string;
      mechanicCertificateType?: string;
      /** DECI-hours, both of them. */
      tachAtCompliance?: number;
      hobbsAtCompliance?: number;
      fileUrls?: string[];
    }) => api<MaintenanceReminder>(`/maintenance/reminders/${id}`, { method: "POST", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reminders"] });
      void qc.invalidateQueries({ queryKey: ["reminder-templates"] });
      void qc.invalidateQueries({ queryKey: ["resource"] });
      void qc.invalidateQueries({ queryKey: ["resources"] });
      //The sign-off is the only thing that writes a record, so this is the only place the
      //log can go stale.
      void qc.invalidateQueries({ queryKey: ["compliance-records"] });
    },
  });
}

// ── Google Calendar integration ─────────────────────────────────────────────
/** Whether the caller has connected Google Calendar. GET /integrations/googleCalendar
 *  returns { data: true } when connected and 404 when not. */
/**
 * Create a recurring maintenance reminder (a "template" server-side).
 *
 * `remindHours`/`remindHoursBefore` are DECI-hours (100 h is 1000) matching the
 * meter fields everywhere else. Attaching `templateResources` is what actually
 * materialises reminder rows against each aircraft; a template with no resources is
 * inert, so callers should always pass the tails it applies to.
 */
export function useCreateMaintenanceReminderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReminderTemplateInput) =>
      api<MaintenanceReminderTemplate>("/maintenance/reminders/templates", { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reminders"] });
      void qc.invalidateQueries({ queryKey: ["reminder-templates"] });
      // The aircraft page embeds its own reminders, so a new template has to reach it too
      //, otherwise the inspection you just added doesn't show up on the tail you added it
      // to until a reload, which reads as the action having failed.
      void qc.invalidateQueries({ queryKey: ["resource"] });
    },
  });
}

export type GoogleCalendarStatus = {
  connected: boolean;
  /** Google's id for the calendar events are written to; "primary" is the default. */
  calendarId: string;
  calendarSummary: string | null;
};

export function useGoogleCalendarStatus(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integration", "googleCalendar"],
    queryFn: async (): Promise<GoogleCalendarStatus> => {
      try {
        // apiRaw, not api: the calendar selection rides beside the `data` flag and
        // the unwrapping helper would throw it away.
        const body = await apiRaw<{ calendarId?: string; calendarSummary?: string | null }>(
          "/integrations/googleCalendar"
        );
        return {
          connected: true,
          calendarId: body?.calendarId || "primary",
          calendarSummary: body?.calendarSummary ?? null,
        };
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return { connected: false, calendarId: "primary", calendarSummary: null };
        }
        throw e;
      }
    },
    ...opts,
  });
}

export type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  backgroundColor: string | null;
};

/**
 * The member's writable Google calendars. Only fetched once connected, and a 403
 * means the connection predates the calendar-list scope, so the card asks for a
 * reconnect rather than showing an error.
 */
export function useGoogleCalendarList(enabled: boolean) {
  return useQuery({
    queryKey: ["integration", "googleCalendar", "calendars"],
    queryFn: () => api<GoogleCalendarOption[]>("/integrations/googleCalendar/calendars"),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSelectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { calendarId: string; calendarSummary?: string | null }) =>
      api("/integrations/googleCalendar/calendar", { method: "PUT", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration", "googleCalendar"] }),
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

export function useDisconnectGoogleCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/integrations/googleCalendar", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration", "googleCalendar"] }),
  });
}

export type CalendarFeedUrls = {
  httpsUrl: string;
  webcalUrl: string;
  token: string;
};

export function useCalendarFeed(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["integration", "calendarFeed"],
    queryFn: async () => {
      try {
        return await api<CalendarFeedUrls>("/integrations/calendarFeed");
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    ...opts,
  });
}

export function useEnsureCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CalendarFeedUrls>("/integrations/calendarFeed", { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["integration", "calendarFeed"], data);
    },
  });
}

export function useRotateCalendarFeed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<CalendarFeedUrls>("/integrations/calendarFeed/rotate", { method: "POST" }),
    onSuccess: (data) => {
      qc.setQueryData(["integration", "calendarFeed"], data);
    },
  });
}

// ── Pre-flight weather (third-party, keyless) ────────────────────────────────
// NOT AerScheduler API calls: these go straight to aviationweather.gov and
// api.sunrise-sunset.org, so they use the plain fetches in lib/weather.ts rather than
// api()/apiRaw(), those attach our Authorization header and unwrap a `{ data }`
// envelope that neither service returns.
//
// React Query is this feature's entire cache; it replaces the hand-rolled maps in the
// Flutter WeatherService. Keys are ROUNDED coordinates (plus the date, for sun times), so
// every reservation at the same field shares one cache entry and one in-flight request.
// which is what keeps a month-long board far under aviationweather.gov's ~100 req/min.
// The fetches never reject: a failure resolves to null, is held for FAILURE_STALE_MS so an
// offline browser doesn't re-request on every badge that mounts, and renders nothing.

/**
 * The nearest METAR to a set of coordinates. Only worth asking for a flight inside the
 * 12-hour observation window (see `shouldIncludeObservation`): an observation says
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
 * flight's own timezone). Courtesy of sunrise-sunset.org, which requires attribution.
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
 * Read from the same `/orgUser/preferences` row the notification settings live on, the
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
              smsNotificationPreferences: {
                ...previous.notificationPreferences?.smsNotificationPreferences,
                ...patch.notificationPreferences.smsNotificationPreferences,
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

export function useSmsStatus(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["user", "sms"],
    queryFn: () => api<SmsStatus>("/users/sms"),
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useStartSmsVerification() {
  return useMutation({
    mutationFn: () => api<{ sent: boolean }>("/users/sms/verify/start", { method: "POST", body: {} }),
  });
}

export function useConfirmSmsVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) =>
      api<{ verified: boolean }>("/users/sms/verify/confirm", { method: "POST", body: { code } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user", "sms"] });
      void qc.invalidateQueries({ queryKey: ["contactDetails"] });
    },
  });
}

export function useSmsOptOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ optedOut: boolean }>("/users/sms/opt-out", { method: "POST", body: {} }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user", "sms"] });
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

// ── Cost splitting ───────────────────────────────────────────────────────────
/**
 * The organization's split rules, plus everything needed to render them: the
 * vocabulary, the human copy, and worked examples computed by the server's own
 * apportionment engine.
 *
 * One call rather than several because a single rule change can alter what SEVERAL
 * booking types resolve to: a new organization-wide default changes every type that
 * has no rule of its own, so the screen always re-reads the whole description rather
 * than patching a row in place and drifting.
 *
 * Admin-only on the server.
 */
export function useSplitRules(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["splitRules"],
    queryFn: () => api<SplitRulesDescription>("/organizations/splitRules"),
    ...opts,
  });
}

/**
 * Set one rule, or clear it.
 *
 * `apportionment: null` REMOVES the rule and returns that charge to the product
 * default. The rules table is sparse (absence means "the default") so removal has to
 * be expressible; writing an explicit "whole" would not be the same thing, because it
 * would survive a later change to what the default is.
 */
export function useSetSplitRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      reservationType: string | null;
      chargeLine: string;
      apportionment: string | null;
    }) => api<SplitRulesDescription>("/organizations/splitRules", { method: "PUT", body: input }),
    onSuccess: (data) => {
      // The response IS the new description, so seed it rather than refetching, the
      // examples and the resolved plan for every type come back in the same payload.
      qc.setQueryData(["splitRules"], data);
      void qc.invalidateQueries({ queryKey: ["organization", "onboarding"] });
    },
  });
}

/** Replace the org's rules with a preset's. The UI shows the exact list first. */
export function useApplySplitPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preset: string) =>
      api<SplitRulesDescription>("/organizations/splitRules/preset", { method: "POST", body: { preset } }),
    onSuccess: (data) => {
      qc.setQueryData(["splitRules"], data);
      void qc.invalidateQueries({ queryKey: ["organization", "onboarding"] });
    },
  });
}

/** Back to one invoice and one payer everywhere, how it worked before splitting. */
export function useClearSplitRules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<SplitRulesDescription>("/organizations/splitRules", { method: "DELETE" }),
    onSuccess: (data) => {
      qc.setQueryData(["splitRules"], data);
      void qc.invalidateQueries({ queryKey: ["organization", "onboarding"] });
    },
  });
}

/**
 * Record who pays what on a booking, each person's own meter readings, their percentage,
 * a waiver, and what they were doing on the flight.
 *
 * Replaces the whole set: shares have to total 100% across everybody, so merging one person
 * into an existing set is how a total quietly stops adding up.
 */
export function useSetReservationPayers(reservationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payers: ReservationPayerInput[]) =>
      api<Reservation>(`/reservations/${reservationId}/payers`, { method: "PUT", body: { payers } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reservations"] });
      void qc.invalidateQueries({ queryKey: ["reservation", reservationId] });
    },
  });
}

//---------------------------------------------------------------------------------
// Training
//
// One invalidation key, ["training"], for everything under it. The pieces are joined.
// signing a lesson changes the record list, the ledger, the standings and the enrollment
// summary all at once, so invalidating them separately would only ever mean one of them
// was briefly wrong on screen.
//---------------------------------------------------------------------------------

const invalidateTraining = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ["training"] });

export function useCourses(filter?: { includeArchived?: boolean }, opts?: QueryOpts) {
  const includeArchived = filter?.includeArchived ?? false;
  return useQuery({
    queryKey: ["training", "courses", { includeArchived }],
    queryFn: () =>
      api<Course[]>("/training/courses", {
        query: includeArchived ? { includeArchived: true } : undefined,
      }),
    ...opts,
  });
}

export function useCourse(courseId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "course", courseId],
    queryFn: () => api<Course>(`/training/courses/${courseId}`),
    enabled: (opts?.enabled ?? true) && courseId != null,
    ...opts,
  });
}

export function useCourseVersion(versionId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "version", versionId],
    queryFn: () => api<CourseVersion>(`/training/versions/${versionId}`),
    enabled: (opts?.enabled ?? true) && versionId != null,
    ...opts,
  });
}

export function useCurriculumTemplates(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "templates"],
    queryFn: () => api<CurriculumTemplateSummary[]>("/training/templates"),
    ...opts,
  });
}

export function useEnrollments(
  filter?: { orgUserId?: number; courseId?: number; status?: string },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["training", "enrollments", filter ?? {}],
    queryFn: () =>
      api<EnrollmentSummary[]>("/training/enrollments", {
        query: filter as Record<string, string | number | undefined>,
      }),
    ...opts,
  });
}

export function useEnrollmentProgress(enrollmentId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "progress", enrollmentId],
    queryFn: () => api<EnrollmentProgress>(`/training/enrollments/${enrollmentId}`),
    enabled: (opts?.enabled ?? true) && enrollmentId != null,
    ...opts,
  });
}

/** Which lessons a booking could be closing out. Drives the close-out picker. */
export function useCandidateLessons(
  args: { orgUserId?: number; type?: string | null },
  opts?: QueryOpts
) {
  return useQuery({
    queryKey: ["training", "candidates", args.orgUserId, args.type ?? null],
    queryFn: () =>
      api<CandidateEnrollment[]>("/training/candidates", {
        query: { orgUserId: args.orgUserId!, type: args.type ?? undefined },
      }),
    enabled: (opts?.enabled ?? true) && args.orgUserId != null,
    ...opts,
  });
}

/**
 * The same lookup for EVERY student on one booking, one query per student, sharing
 * the cache keys `useCandidateLessons` writes.
 *
 * A booking can carry several students (two in the aircraft, a whole ground class),
 * and whether the close-out has any grading on it at all is a question about the
 * WHOLE set, not about one student. Asking per-student down in the tree meant the
 * section could not tell "nobody here is enrolled on anything" from "still loading",
 * so it drew a Training record header over an empty card. Returns a stable array
 * aligned to `orgUserIds`.
 */
export function useCandidateLessonsFor(
  orgUserIds: number[],
  type?: string | null,
  opts?: QueryOpts
) {
  const enabled = opts?.enabled ?? true;
  return useQueries({
    queries: orgUserIds.map((id) => ({
      queryKey: ["training", "candidates", id, type ?? null],
      queryFn: () =>
        api<CandidateEnrollment[]>("/training/candidates", {
          query: { orgUserId: id, type: type ?? undefined },
        }),
      enabled: enabled && id != null,
    })),
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string;
      regulatoryPart?: string;
      certificateSought?: string;
      ratingId?: number | null;
    }) => api<{ id: number }>("/training/courses", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useCreateCourseFromTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, name }: { key: string; name?: string }) =>
      api<{ id: number; versionId: number; lessons: number }>(`/training/templates/${key}`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function usePublishCourseVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, approvalReference }: { versionId: number; approvalReference?: string }) =>
      api<{ id: number }>(`/training/versions/${versionId}/publish`, {
        method: "POST",
        body: { approvalReference },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useCreateCourseVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, label, copyFromVersionId }: { courseId: number; label: string; copyFromVersionId?: number }) =>
      api<{ id: number }>(`/training/courses/${courseId}/versions`, {
        method: "POST",
        body: { label, copyFromVersionId },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useEnrollStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { versionId: number; orgUserId: number; enrollmentCertificateNumber?: string }) =>
      api<{ id: number }>("/training/enrollments", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useSaveLessonRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      enrollmentId: number;
      lessonId: number;
      recordId?: number;
      grade?: string | null;
      notes?: string | null;
      flightDeciHours?: number | null;
      instructionDeciHours?: number | null;
      simulatorDeciHours?: number | null;
      reservationId?: number | null;
      taskGrades?: { lessonTaskId: number; grade: string; notes?: string }[];
    }) => api<{ id: number; warning: string | null }>("/training/records", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useSignLessonRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, credits }: { recordId: number; credits?: { requirementId: number; deciHours?: number; count?: number }[] }) =>
      api<{ id: number; creditsPosted: number }>(`/training/records/${recordId}/sign`, {
        method: "POST",
        body: { credits },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useCountersignLessonRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: number) =>
      api<{ id: number }>(`/training/records/${recordId}/countersign`, { method: "POST" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useAmendLessonRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recordId, reason }: { recordId: number; reason: string }) =>
      api<{ id: number; reversed: number }>(`/training/records/${recordId}/amend`, {
        method: "POST",
        body: { reason },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useGraduateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, graduationCertificateNumber }: { enrollmentId: number; graduationCertificateNumber?: string }) =>
      api<{ id: number }>(`/training/enrollments/${enrollmentId}/graduate`, {
        method: "POST",
        body: { graduationCertificateNumber },
      }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function usePostRequirementCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      enrollmentId: number;
      requirementId: number;
      deciHours?: number | null;
      count?: number | null;
      source: string;
      notes?: string;
      /** When the training happened. Omitted means now, see the server's postCredit. */
      occurredAt?: string;
    }) => api<{ id: number }>("/training/credits", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useReverseRequirementCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ creditId, reason }: { creditId: number; reason: string }) =>
      api<{ id: number }>(`/training/credits/${creditId}/reverse`, { method: "POST", body: { reason } }),
    onSuccess: () => invalidateTraining(qc),
  });
}

//---------------------------------------------------------------------------------
// Syllabus editing, endorsements, and the rest of the enrollment lifecycle
//---------------------------------------------------------------------------------

export function useUpsertStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, ...body }: { versionId: number; stageId?: number; name: string; objective?: string | null; position: number; requiresStageCheck?: boolean }) =>
      api<{ id: number }>(`/training/versions/${versionId}/stages`, { method: "PUT", body }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, stageId }: { versionId: number; stageId: number }) =>
      api<{ id: number }>(`/training/versions/${versionId}/stages/${stageId}`, { method: "DELETE" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useUpsertLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, ...body }: {
      versionId: number; lessonId?: number; stageId: number; name: string; position: number;
      kind: string; objectives?: string | null; completionStandards?: string | null;
      minFlightDeciHours?: number | null; minGroundDeciHours?: number | null;
      requiresSignoff?: boolean; requiresNotes?: boolean; isStageCheck?: boolean;
      credits?: { requirementId: number; creditFrom: string }[];
    }) => api<{ id: number }>(`/training/versions/${versionId}/lessons`, { method: "PUT", body }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, lessonId }: { versionId: number; lessonId: number }) =>
      api<{ id: number }>(`/training/versions/${versionId}/lessons/${lessonId}`, { method: "DELETE" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useSetLessonTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, lessonId, tasks }: {
      versionId: number; lessonId: number;
      tasks: { name: string; position: number; acsCode?: string | null; standard?: string | null }[];
    }) => api<{ count: number }>(`/training/versions/${versionId}/lessons/${lessonId}/tasks`, { method: "PUT", body: { tasks } }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useUpsertRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, ...body }: {
      versionId: number; requirementId?: number; code: string; label: string;
      minDeciHours?: number | null; minCount?: number | null; source?: string;
      maxSimulatorBps?: number | null; maxTransferBps?: number | null;
      /** Always send it. The server treats an omitted value as "clear the window". */
      recencyCalendarMonths?: number | null;
    }) => api<{ id: number }>(`/training/versions/${versionId}/requirements`, { method: "PUT", body }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useDeleteRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, requirementId }: { versionId: number; requirementId: number }) =>
      api<{ id: number }>(`/training/versions/${versionId}/requirements/${requirementId}`, { method: "DELETE" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useSetGradingScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, scale }: { versionId: number; scale: { code: string; passing: boolean }[] }) =>
      api<{ id: number }>(`/training/versions/${versionId}/gradingScale`, { method: "PUT", body: { scale } }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useRetireCourseVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, retired }: { versionId: number; retired: boolean }) =>
      api<{ id: number }>(`/training/versions/${versionId}/retire`, { method: "POST", body: { retired } }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, ...body }: {
      courseId: number; name?: string; description?: string | null;
      certificateSought?: string | null; targetDays?: number | null; archived?: boolean;
      enrollmentFeeCents?: number | null; enrollmentFeeLabel?: string | null;
    }) => api<{ id: number }>(`/training/courses/${courseId}`, { method: "PATCH", body }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useEndEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, status, reason }: { enrollmentId: number; status: "terminated" | "transferred"; reason?: string }) =>
      api<{ id: number }>(`/training/enrollments/${enrollmentId}/end`, { method: "POST", body: { status, reason } }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useCertifyEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: number) =>
      api<{ id: number }>(`/training/enrollments/${enrollmentId}/certify`, { method: "POST" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useEndorsements(filter?: { orgUserId?: number; includeSuperseded?: boolean }, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "endorsements", filter ?? {}],
    queryFn: () =>
      api<Endorsement[]>("/training/endorsements", {
        query: filter as Record<string, string | number | boolean | undefined>,
      }),
    ...opts,
  });
}

export function useEndorsementTemplates(orgUserId?: number, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "endorsementTemplates", orgUserId ?? null],
    queryFn: () =>
      api<EndorsementTemplate[]>("/training/endorsements/templates", {
        query: orgUserId ? { orgUserId } : undefined,
      }),
    ...opts,
  });
}

export function useCreateEndorsement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      orgUserId: number; templateCode?: string | null; title: string; renderedText: string;
      expiresAt?: string | null; enrollmentId?: number | null;
      signerCertificateNumber?: string | null; supersedesId?: number | null;
    }) => api<{ id: number }>("/training/endorsements", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

//---------------------------------------------------------------------------------
// Training grants
//---------------------------------------------------------------------------------

/**
 * The school's permission vocabulary: names, labels, descriptions, and which roles already
 * confer each one.
 *
 * Served rather than hardcoded, for the same reason the training catalog is: the
 * description is the sentence an administrator reads while deciding whether to let
 * somebody void an invoice, and a copy of it in the client would drift from the rule the
 * server actually enforces.
 */
export function usePermissionCatalog(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["permissions", "catalog"],
    queryFn: () => api<GrantOption[]>("/me/permissions/catalog"),
    // A constant in the server's source. Refetching on window focus is pure noise.
    staleTime: Infinity,
    ...opts,
  });
}

/** What one member may do, roles and issued grants resolved together. Admin only. */
export function useMemberPermissions(orgUserId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["permissions", "member", orgUserId],
    queryFn: () => api<MemberPermissions>(`/me/permissions/members/${orgUserId}`),
    enabled: orgUserId != null,
    ...opts,
  });
}

export function useGrantPermission(orgUserId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { grant: string; courseId?: number | null }) =>
      api<GrantRow>(`/me/permissions/members/${orgUserId}`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permissions"] }),
  });
}

export function useRevokePermission(orgUserId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: number) =>
      api<{ id: number }>(`/me/permissions/members/${orgUserId}/${grantId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["permissions"] }),
  });
}

export function useTrainingGrantCatalog(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "grantCatalog"],
    queryFn: () => api<TrainingGrantOption[]>("/training/grants/catalog"),
    //The four grants are a constant in the server's source; refetching them on every
    //window focus is pure noise.
    staleTime: Infinity,
    ...opts,
  });
}

export function useTrainingGrants(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "grants"],
    queryFn: () => api<TrainingGrant[]>("/training/grants"),
    ...opts,
  });
}

/**
 * What the signed-in person may do in training.
 *
 * Deliberately asked of the server rather than derived from roles: the admin bypass lives
 * in one place, and a client re-implementing it would drift the first time either changed.
 */
export function useMyTrainingGrants(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["training", "myGrants"],
    queryFn: () => api<MyTrainingGrants>("/training/grants/mine"),
    ...opts,
  });
}

export function useCreateTrainingGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgUserId: number; grant: string; courseId?: number | null }) =>
      api<{ id: number }>("/training/grants", { method: "POST", body: input }),
    onSuccess: () => invalidateTraining(qc),
  });
}

export function useRevokeTrainingGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: number) =>
      api<{ id: number }>(`/training/grants/${grantId}`, { method: "DELETE" }),
    onSuccess: () => invalidateTraining(qc),
  });
}

/**
 * Raise the invoice for an enrollment's course fee.
 *
 * Invalidates invoices as well as training: the fee shows up in the ordinary Invoices
 * list, and a stale list right after billing is the one place somebody would reasonably
 * conclude it had not worked and press the button again.
 */
export function useBillEnrollmentFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enrollmentId: number) =>
      api<{ id: number; invoiceId: number }>(`/training/enrollments/${enrollmentId}/fee`, {
        method: "POST",
      }),
    onSuccess: () => {
      invalidateTraining(qc);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

//---------------------------------------------------------------------------------
// Membership.
//
// One invalidation key, ["membership"], for the whole feature, plans, memberships and
// the ledger move together (changing a plan changes what the member card shows, billing a
// period changes both the ledger and the roster), so invalidating them apart would only
// ever mean one of them was briefly wrong on screen.
//
// Every mutation that raises money ALSO invalidates ["invoices"]. A stale invoice list
// immediately after billing is the one place somebody would reasonably conclude it had not
// worked and press the button again.
//---------------------------------------------------------------------------------

const invalidateMembership = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: ["membership"] });

const invalidateMembershipAndMoney = (qc: ReturnType<typeof useQueryClient>) => {
  invalidateMembership(qc);
  qc.invalidateQueries({ queryKey: ["invoices"] });
};

export function useMembershipPlans(includeArchived = false, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["membership", "plans", includeArchived],
    queryFn: () =>
      api<MembershipPlan[]>(`/memberships/plans${includeArchived ? "?includeArchived=true" : ""}`),
    ...opts,
  });
}

/**
 * The plans a member may be put on, names and prices only.
 *
 * A separate hook from `useMembershipPlans` rather than a filter over it, because this one
 * is open to any org user and that one is admin-only. Sharing a cache key would mean a
 * dispatcher's narrow list and an admin's full list overwriting each other.
 */
export function useMembershipPlanOptions(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["membership", "plan-options"],
    queryFn: () => api<MembershipPlanOption[]>("/memberships/plans/options"),
    ...opts,
  });
}

export function useCreateMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Partial<MembershipPlan>) =>
      api<{ id: number }>("/memberships/plans", { method: "POST", body: values }),
    onSuccess: () => invalidateMembership(qc),
  });
}

export function useUpdateMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, ...values }: Partial<MembershipPlan> & { planId: number }) =>
      api<{ id: number }>(`/memberships/plans/${planId}`, { method: "PATCH", body: values }),
    onSuccess: () => invalidateMembership(qc),
  });
}

/** Retire a plan, or bring it back. There is no delete, history has to stay readable. */
export function useArchiveMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, archived }: { planId: number; archived: boolean }) =>
      api<{ id: number }>(`/memberships/plans/${planId}/archive`, { method: "POST", body: { archived } }),
    onSuccess: () => invalidateMembership(qc),
  });
}

/** Every membership in the org, for the roster screen. */
export function useMemberships(
  params: { status?: string; planId?: number; take?: number; skip?: number } = {},
  opts?: QueryOpts
) {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.planId) search.set("planId", String(params.planId));
  if (params.take) search.set("take", String(params.take));
  if (params.skip) search.set("skip", String(params.skip));
  const qs = search.toString();

  return useQuery({
    queryKey: ["membership", "list", params],
    queryFn: () => api<Membership[]>(`/memberships${qs ? `?${qs}` : ""}`),
    ...opts,
  });
}

/** The membership on one member's record page. Resolves to null when they are not on a plan. */
export function useMembershipForOrgUser(orgUserId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["membership", "orgUser", orgUserId],
    queryFn: () => api<Membership | null>(`/memberships/orgUser/${orgUserId}`),
    enabled: orgUserId != null && opts?.enabled !== false,
  });
}

/** The caller's own membership. Null at every org that does not use the feature. */
export function useMyMembership(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["membership", "me"],
    queryFn: () => api<MyMembership | null>("/memberships/me"),
    ...opts,
  });
}

export function useCreateMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      orgUserId: number;
      planId: number;
      start?: boolean;
      waiveJoinFee?: boolean;
      notes?: string | null;
    }) => api<{ id: number }>("/memberships", { method: "POST", body }),
    onSuccess: () => invalidateMembership(qc),
  });
}

export function useSetMembershipStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, status, reason }: { membershipId: number; status: MembershipStatus; reason?: string }) =>
      api<{ id: number; status: string }>(`/memberships/${membershipId}/status`, {
        method: "POST",
        body: { status, reason },
      }),
    onSuccess: () => invalidateMembership(qc),
  });
}

/** Move a member to a different plan, at that plan's current prices. */
export function useChangeMembershipPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, planId }: { membershipId: number; planId: number }) =>
      api<{ id: number }>(`/memberships/${membershipId}/plan`, { method: "POST", body: { planId } }),
    onSuccess: () => invalidateMembership(qc),
  });
}

export function useUpdateMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      membershipId,
      ...values
    }: {
      membershipId: number;
      autoBillDues?: boolean;
      notes?: string | null;
      agreementOnFile?: boolean;
      agreementDocumentId?: number | null;
    }) => api<{ id: number }>(`/memberships/${membershipId}`, { method: "PATCH", body: values }),
    onSuccess: () => invalidateMembership(qc),
  });
}

export function useBillMembershipJoinFee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: number) =>
      api<{ id: number; invoiceId: number }>(`/memberships/${membershipId}/joinFee`, { method: "POST" }),
    onSuccess: () => invalidateMembershipAndMoney(qc),
  });
}

/**
 * Bill the next dues period.
 *
 * WHICH period is decided by the server from the membership's own cursor, deliberately
 * not sent from here. A client that could name the period could bill the same month twice.
 */
export function useBillMembershipDues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId: number) =>
      api<{ chargeId: number; invoiceId: number | null }>(`/memberships/${membershipId}/dues`, { method: "POST" }),
    onSuccess: () => invalidateMembershipAndMoney(qc),
  });
}

/** Waive the next period, a comped month, a leave of absence. */
export function useSkipMembershipDues() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ membershipId, reason }: { membershipId: number; reason?: string }) =>
      api<{ chargeId: number }>(`/memberships/${membershipId}/dues/skip`, { method: "POST", body: { reason } }),
    onSuccess: () => invalidateMembership(qc),
  });
}

/** One plan's per-aircraft rate overrides. Empty means the plan bills every tail as published. */
export function useMembershipPlanRates(planId: number | undefined, opts?: QueryOpts) {
  return useQuery({
    queryKey: ["membership", "plan-rates", planId],
    queryFn: () => api<MembershipPlanRate[]>(`/memberships/plans/${planId}/rates`),
    enabled: planId != null && opts?.enabled !== false,
  });
}

/**
 * Set or clear one plan's rate for one aircraft.
 *
 * Sending both rates null CLEARS the override, so the aircraft returns to its published
 * rate. Idempotent on (plan, aircraft), it is a PUT, not a POST.
 */
export function useSetMembershipPlanRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      planId,
      resourceId,
      dryRate,
      wetRate,
    }: {
      planId: number;
      resourceId: number;
      dryRate?: number | null;
      wetRate?: number | null;
    }) =>
      api<{ id: number } | null>(`/memberships/plans/${planId}/rates/${resourceId}`, {
        method: "PUT",
        body: { dryRate, wetRate },
      }),
    onSuccess: () => invalidateMembership(qc),
  });
}

/**
 * The school's Airworthiness Directive posture, and what we could match for each aeroplane.
 *
 * Admin-only on the server. Kept under its own key rather than folded into the organization
 * query, because the readiness figures change whenever an aircraft's serial number is edited
 * and that should not invalidate the whole org.
 */
export function useAdTracking(opts?: QueryOpts) {
  return useQuery({
    queryKey: ["ad-tracking"],
    queryFn: () => api<AdReadiness>("/organizations/adTracking"),
    ...opts,
  });
}

export function useSetAdTracking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { mode: AdTrackingMode; externalSystem?: string | null }) =>
      api<AdReadiness>("/organizations/adTracking", { method: "PATCH", body: input }),
    onSuccess: (data) => {
      qc.setQueryData(["ad-tracking"], data);
      //Maintenance surfaces read the mode to decide what to show, so they go stale too.
      void qc.invalidateQueries({ queryKey: ["reminders"] });
      void qc.invalidateQueries({ queryKey: ["reminder-templates"] });
    },
  });
}
