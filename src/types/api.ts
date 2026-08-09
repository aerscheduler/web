// Types mirrored from the server Prisma schema (see _local/insights/api-contract.md).
// All DateTime columns arrive as ISO strings; all money fields are integer cents.
//
// There are deliberately NO `FK_*` fields here. The server strips every property
// whose name contains "FK_" from outgoing JSON (server/src/middleware/
// stripForeignKeys.ts), so declaring them would describe fields that are always
// `undefined` at runtime — which is exactly how the dispatch board once grouped
// every reservation into "Unassigned" and the location filter silently matched
// nothing. Read the nested relation's id instead: `r.resource?.id`,
// `r.location?.id`, `member.user?.id`. Leaving them off the types makes that a
// compile error rather than a silent one.

export type Role =
  | "owner"
  | "admin"
  | "dispatcher"
  | "instructor"
  | "student"
  | "renter"
  | "technician";

export interface User {
  id: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  lastActiveAt: string | null;
  email: string;
  emailVerifiedAt: string | null;
  name: string;
  showInDirectory?: boolean;
  publicProfileImage?: string | null;
  orgUsers?: OrganizationUser[];
  organizations?: Organization[];
  details?: UserDetails;
}

/**
 * A person's contact record.
 *
 * Optional on `User` and frequently absent: the server only returns it to the person
 * themselves, an admin or dispatcher, or an instructor of that student. Treat a missing
 * `details` as "you may not see this", not as "they haven't filled it in" — the two look
 * the same from here and only the server can tell them apart.
 *
 * Every phone field is **E.164** (`+13035551234`). Render it through `formatPhone` from
 * `@/lib/phone`; never print it raw.
 */
export interface UserDetails {
  id: number;
  phone: string | null;
  /** ISO 3166-1 alpha-2 for `phone`, so it can be re-rendered in its own national format. */
  phoneCountry?: string | null;
  homePhone?: string | null;
  workPhone?: string | null;
  /** `YYYY-MM-DD`. A calendar date — no time, no zone. */
  dateOfBirth?: string | null;
  preferredName?: string | null;
  sex?: string | null;
  address?: UserAddress;
  emergencyContacts?: EmergencyContact[];
}

/** Who to call about a person in an emergency. Primary first, as returned. */
export interface EmergencyContact {
  id: number;
  name: string;
  relationship: string | null;
  /** E.164. Required — a contact with no number isn't a contact. */
  phone: string;
  phoneCountry?: string | null;
  altPhone: string | null;
  altPhoneCountry?: string | null;
  email: string | null;
  notes: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface UserAddress {
  id: number;
  streetAddress1: string;
  streetAddress2: string | null;
  city: string;
  zipCode: string;
  state: string;
  country: string;
}

export interface Organization {
  id: number;
  createdAt: string;
  name: string;
  organizationType: string | null;
  code: string;
  profileImage: string | null;
  about?: string | null;
  /** The school's primary IANA zone; the fallback for a location that has none. */
  timeZone?: string | null;
  /**
   * When set, the school will be hard-deleted at this time. Null / absent means no
   * countdown is running. Owners schedule via DELETE /organizations; admins cancel
   * via POST /organizations/cancelDeletion.
   */
  scheduledDeletionAt?: string | null;
  billing?: OrganizationBillingSettings;
  preferences?: OrganizationPreferences;
  bookingPolicy?: OrganizationBookingPolicy;
  slotOfferSettings?: OrganizationSlotOfferSettings;
  details?: OrganizationDetails;
}

/**
 * A member's own time-zone settings, stored per membership.
 *
 * Two settings, deliberately: `timeZoneMode` decides which zone is "mine" (follow the device,
 * or a pinned one), while `scheduleTimeZoneMode` decides which zone the SCHEDULE renders in.
 * They are separate because a personal zone silently driving the board is the bug this whole
 * feature exists to fix — so the schedule defaults to airport time and says so.
 */
export interface TimeZonePreferences {
  timeZone?: string | null;
  timeZoneMode?: "auto" | "manual";
  scheduleTimeZoneMode?: "location" | "user";
}

/** Per-category email / push toggles under `/orgUsers/preferences`. */
export interface ChannelNotificationPreferences {
  reservationCreated?: boolean;
  reservationUpdated?: boolean;
  reservationCanceled?: boolean;
  reservationCompleted?: boolean;
  reservationInvoiceReceived?: boolean;
  reservationInvoicePaid?: boolean;
  reservationInvoiceDeclined?: boolean;
  reservationInvoiceReminders?: boolean;
  joinedOrganization?: boolean;
  leftOrganization?: boolean;
  invitedToOrganization?: boolean;
  joinRequestApproved?: boolean;
  joinRequestDeclined?: boolean;
  announcements?: boolean;
  maintenanceReminders?: boolean;
  squawks?: boolean;
  userDocumentReminders?: boolean;
  currencyReminders?: boolean;
  endorsementReminders?: boolean;
  grounded?: boolean;
}

export interface OrgUserNotificationPreferences {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  smsEnabled?: boolean;
  emailNotificationPreferences?: ChannelNotificationPreferences | null;
  pushNotificationPreferences?: ChannelNotificationPreferences | null;
}

/** Full member preferences row (timezone + notifications). */
export interface OrgUserPreferences extends TimeZonePreferences {
  id?: number;
  notificationPreferences?: OrgUserNotificationPreferences | null;
}

export interface OrganizationDetails {
  id: number;
  phone: string | null;
  email: string | null;
}

/** Per-aircraft platform subscription status (GET /subscription). Stripe-backed. */
export interface SubscriptionStatus {
  hasSubscription: boolean;
  status?: string; // trialing | active | past_due | canceled | unpaid | incomplete…
  quantity?: number;
  trialEnd?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export interface OrganizationPreferences {
  id: number;
  /** When true, joining by code creates a request an admin must approve. */
  private: boolean;
  newOrgOnboardingComplete: boolean;
  instructorsCanOverrideReservationPrices: boolean;
  personnelCanOnlyUseApprovedResources: boolean;
  /** Students may only be booked with an instructor they're assigned to. */
  studentsCanOnlyFlyWithTheirInstructors: boolean;
  /** The mirror of the above, from the instructor's side. */
  instructorsCanOnlyFlyWithTheirStudents: boolean;
  /**
   * When true, ramp-in offers a home-base picker and posts
   * `POST /resources/:id/location` before the meter readings.
   */
  updateResourceLocationOnRampIn?: boolean;
}

/**
 * Setup-checklist state for the org (`/organizations/onboarding`).
 *
 * Note what is NOT here: any record of which items are done. That is derived from the
 * org's own data by `lib/onboarding-checklist.ts`, so this only carries the two things
 * data can't answer — where they came from, and what they chose to ignore.
 */
export interface OrgOnboarding {
  id: number;
  /** Marketing entry point captured at signup ("quickbooks"); null for direct. */
  source: string | null;
  /** Item ids the org waved off. Ids are owned by the client. */
  dismissedItems: string[];
  /** Set when the whole checklist was dismissed. */
  dismissedAt: string | null;
}

/** Org-wide booking policy defaults (1:1). Source of truth for schedule gates. */
export interface OrganizationBookingPolicy {
  id?: number;
  requirePaymentMethod: boolean;
  /**
   * Whether a booking may keep the resource past local midnight.
   *
   * Off by default and deliberately opt-in, because a multi-day booking overrides the
   * aircraft's operating hours (every other booking has to fit inside one contiguous free
   * window, which is how a school says "this aircraft flies 08:00 to 18:00") and it makes
   * the booking's time zone decide the night count, which the overnight minimum turns into
   * money. Gated on the school having a resolvable time zone: see MultiDayReadiness.
   */
  multiDayEnabled: boolean;
}

/** Org-wide slot offer / standby settings (1:1). Source of truth for the master switch and later hold rules. */
export interface OrganizationSlotOfferSettings {
  id?: number;
  /** When false, no new cancel-recovery or desk offers; standby UI stays hidden. Default on. */
  enabled: boolean;
}


/**
 * Whether a school may switch multi-day bookings on, and what to fix if not.
 *
 * Served by GET /organizations/multiDayReadiness purely so the toggle can say what is
 * missing before anybody clicks it. The rule is enforced on the PATCH as well.
 */
export interface MultiDayReadiness {
  ready: boolean;
  /** Names of locations with no zone set. Empty when ready. */
  locationsMissingZone: string[];
  /** Prose naming what to fix. Present only when not ready. */
  problem?: string;
}

export interface OrganizationBillingSettings {
  id: number;
  enabled: boolean;
  defaultInstructorRate: number;
  serviceFeePercent: number | null;
  serviceFeeLabel: string;
  stripeEnabled: boolean;
  /**
   * Least billable time per NIGHT an aircraft is kept away, in TENTHS of an hour.
   *
   * Null means the school charges no overnight minimum, which is distinct from 0 and is
   * what every org read before the setting existed. Nights rather than days because a
   * same-day booking spans one day, so a day-based figure would bill every local circuit
   * at the minimum.
   */
  overnightMinimumTenths: number | null;
  /**
   * How many unpaid invoices before a member is grounded, or null/0 for off.
   *
   * A COUNT, not a number of days — the server evaluates it when an invoice is raised and
   * again on the nightly overdue sweep. Grounding blocks AIRCRAFT bookings only; ground
   * school, simulators and rooms are unaffected. Paying releases the member automatically.
   */
  groundUserUnpaidInvoices: number | null;
  /**
   * May dispatchers raise an invoice by hand, outside a reservation's close-out?
   *
   * Admins and owners always can, so this only ever WIDENS. The server checks it in
   * `validateCustomInvoiceValues` on `POST /invoices`, which means it is a real permission
   * and not a UI hint: with it off, a dispatcher's attempt is refused by the API.
   */
  dispatchersCanManuallyCreateInvoices: boolean;
  /** The same grant for instructors. Independent of the dispatcher one, not a hierarchy. */
  instructorsCanManuallyCreateInvoices: boolean;
}

export interface RoleRow {
  id: number;
}

/**
 * One side of an instructor↔student assignment, as it arrives nested under
 * `instructorRole.students` / `studentRole.instructors` on `GET /users/:id`.
 *
 * Note `id` here is the ROLE-table id, not an OrganizationUser id — the id the
 * reservation API wants is `orgUser.id`.
 */
export interface AssignedPerson {
  id: number;
  orgUser?: {
    id: number;
    profileImage: string | null;
    user?: Pick<User, "id" | "name" | "email">;
  };
}

/** `instructorRole` as returned by `GET /users/:id` — carries the assigned students. */
export interface InstructorRoleRow extends RoleRow {
  students?: AssignedPerson[];
}

/** `studentRole` as returned by `GET /users/:id` — carries the assigned instructors. */
export interface StudentRoleRow extends RoleRow {
  instructors?: AssignedPerson[];
}

/**
 * Pending pairing request. Role-table ids on `student` / `instructor`.
 * - Student-side queue (`GET /students/requests`): instructor asked to take this student.
 * - Instructor-side queue (`GET /instructors/requests`): student asked for this instructor.
 */
export interface InstructionPairRequest {
  id: number;
  createdAt?: string;
  status?: string | null;
  student?: AssignedPerson | null;
  instructor?: AssignedPerson | null;
}

export interface OrganizationUser {
  id: number;
  createdAt: string;
  identifier: string | null;
  grounded: boolean;
  /** Why they were grounded, when whoever grounded them said. */
  groundedReason?: string | null;
  /**
   * When they were retired from the roster; null for a current member.
   *
   * Not the same thing as `grounded`. Grounding is a live restriction on somebody who
   * is still here and is deliberately noisy — they're emailed about it. Archiving is a
   * filing decision, tells them nothing, and takes them out of every list.
   */
  archivedAt?: string | null;
  profileImage: string | null;
  adminRole?: RoleRow | null;
  ownerRole?: RoleRow | null;
  instructorRole?: InstructorRoleRow | null;
  studentRole?: StudentRoleRow | null;
  renterRole?: RoleRow | null;
  dispatcherRole?: RoleRow | null;
  technicianRole?: RoleRow | null;
  user?: User;
  /**
   * Whether they are checked out on the aircraft the request named in
   * `approvedForResourceId`. Absent unless that filter was passed — so treat
   * `undefined` as "not asked", not as "not approved".
   */
  approvedForResource?: boolean;
}

export interface RolesUpdate {
  owner: boolean;
  admin: boolean;
  instructor: boolean;
  student: boolean;
  renter: boolean;
  technician: boolean;
  dispatcher: boolean;
}

/** Derive the list of active roles on a membership row. */
export function rolesOf(ou: OrganizationUser): Role[] {
  const out: Role[] = [];
  if (ou.ownerRole) out.push("owner");
  if (ou.adminRole) out.push("admin");
  if (ou.dispatcherRole) out.push("dispatcher");
  if (ou.instructorRole) out.push("instructor");
  if (ou.technicianRole) out.push("technician");
  if (ou.studentRole) out.push("student");
  if (ou.renterRole) out.push("renter");
  return out;
}

export type ReservationType =
  | "ground"
  | "dual"
  | "instructor"
  | "solo"
  /**
   * Several pilots aboard with NO instructor — two pilots splitting a cross-country, or a
   * safety-pilot arrangement for instrument practice.
   *
   * Distinct from `solo` for a regulatory reason: 14 CFR 61.87 defines solo flight as the
   * time "during which a student pilot is the sole occupant of the aircraft", so a solo with
   * two people on it is a false record — and dual-versus-solo is the split a training record
   * and an examiner actually read.
   */
  | "shared"
  | "sim"
  | "rental"
  | "guest"
  | "maintenance";

export interface Reservation {
  id: number;
  createdAt: string;
  /** Last change of any kind — rescheduling, personnel, notes. */
  updatedAt?: string;
  cancelledAt: string | null;
  /** Free text the canceller typed, and the fixed category they picked. */
  cancellationReason?: string | null;
  cancellationCategory?: string | null;
  /** Who booked it. The nested relation survives the FK_* response strip. */
  createdBy?: OrganizationUser | null;
  /** Who cancelled it. Only meaningful alongside `cancelledAt`. */
  cancelledBy?: OrganizationUser | null;
  title: string;
  type: ReservationType;
  start: string;
  end: string;
  timeZoneName: string;
  notes: string | null;
  personnel?: ReservationPersonnel;
  resource?: Resource;
  /**
   * The field this booking is at. Carries `timeZone`, which is what every schedule surface
   * positions and formats against — the airport's clock, not the viewer's.
   */
  location?: Location | null;
  /**
   * ONE PER PAYER. A booking split between several people mints an invoice each — a Stripe
   * invoice bills exactly one customer, so splitting has to be N invoices rather than one
   * invoice with shares underneath.
   *
   * Never read `invoices[0]` as "the invoice": on a group booking that is one student's
   * share, and treating it as the booking's bill is the bug this feature exists to fix.
   * Use the helpers in `components/schedule/board-filters.ts` (billingStatus) and
   * `close-out.ts` (closeOutStep), which reason over the whole set.
   */
  invoices?: Invoice[];
  /** Ramp/close-out readings + sign-offs. Present on the retrieve include set. */
  review?: ReservationReview | null;
  /**
   * Each person's stake in the cost, when anyone has one recorded. SPARSE — no row means
   * "ordinary payer, split by the org's rules", so an empty list is the normal case.
   */
  payers?: ReservationPayer[] | null;
  /**
   * Hand-typed prices for this one booking. Only on `GET /reservations/:id` (the board's
   * list select omits it), so read it off the hydrated detail record, never off a list row.
   */
  paymentOverrides?: ReservationPaymentOverrides | null;
  /**
   * The staff member who closed out a guest reservation (guests never confirm with a PIN —
   * an admin, the instructor, or the creator reviews it via `confirmReviewGuest`). Non-null
   * ⇒ the guest reservation has been reviewed and its invoice generated.
   */
  completedByForGuest?: { id: number } | null;
  /** Set when this reservation is one occurrence of a repeating booking. */
  series?: ReservationSeries | null;
}

export interface ReservationPersonnel {
  id: number;
  instructors?: OrganizationUser[];
  students?: OrganizationUser[];
  renters?: OrganizationUser[];
  guests?: Guest[];
}

/**
 * Close-out record for a reservation. Hobbs/tach/briefing are meter readings in
 * decimal hours (round-tripped verbatim, the same representation as `Plane.hobbsTime`).
 * A null `*Out` pair means "not ramped out yet"; a null `*In` pair means "not ramped in yet".
 */
export interface ReservationReview {
  id: number;
  briefing: number | null;
  hobbsTimeOut: number | null;
  hobbsTimeIn: number | null;
  tachTimeOut: number | null;
  tachTimeIn: number | null;
  comments?: string[];
  /**
   * When the aircraft actually left and came back — the times, as opposed to the meter
   * readings above. Null on anything ramped before these columns shipped (2026-08-02),
   * and `rampedInAt` is null on a flight that is still out.
   *
   * Not interchangeable with `createdAt`/`updatedAt`: the review row is created with the
   * reservation, so `createdAt` is booking time, and `updatedAt` moves on every later
   * correction and sign-off.
   */
  rampedOutAt?: string | null;
  rampedInAt?: string | null;
  /** Row lifecycle — `createdAt` is when the booking was made, not when it flew. */
  createdAt?: string;
  updatedAt?: string;
  /** One row per pilot who has signed off; length === personnel count ⇒ fully reviewed. */
  reviewConfirmations?: ReservationReviewConfirmation[];
}

export interface ReservationReviewConfirmation {
  id: number;
  /** When this pilot signed off. */
  createdAt?: string;
  reviewedBy?: OrganizationUser;
}

/**
 * Prices typed by hand for one booking, overriding the school's rate card.
 *
 * FIVE COLUMNS, TWO OF WHICH THE PRICING ENGINE NEVER READS.
 *
 * `services/payment.ts` consults `instructorRateOverride`, `instructorPriceOverride` and
 * `resourceRateOverride`, and nothing else. `resourcePriceOverride` and
 * `totalPriceOverride` are accepted by the endpoint, stored, and then ignored when the
 * invoice is computed, so offering either in the console would be a dispatcher setting a
 * price that silently does not apply. They are declared here because the record carries
 * them, and read-only for exactly that reason.
 *
 * Rates are CENTS PER HOUR (not tenths: hours are tenths, money is cents). A price is a
 * flat cents figure for that side of the booking, replacing rate times hours.
 */
export interface ReservationPaymentOverrides {
  id: number;
  createdAt?: string;
  /** Cents per hour of instruction, in place of the rating or org default rate. */
  instructorRateOverride: number | null;
  /** Flat cents for the instruction line. Wins over the rate above. Not offered in the UI. */
  instructorPriceOverride: number | null;
  /** Cents per Hobbs or tach hour, in place of the aircraft's wet/dry or tier rate. */
  resourceRateOverride: number | null;
  /** Stored, never priced. See the note above. */
  resourcePriceOverride: number | null;
  /** Stored, never priced. See the note above. */
  totalPriceOverride: number | null;
}

export interface Guest {
  id: number;
  name: string;
  email: string;
  phone: string | null;
}

export interface Resource {
  id: number;
  createdAt: string;
  featuredImage: string | null;
  type?: ResourceType;
  location?: Location;
}

export interface ResourceType {
  id: number;
  plane?: Plane | null;
  room?: Room | null;
  simulator?: Simulator | null;
}

export interface Plane {
  id: number;
  tailNumber: string;
  tachTime: number;
  hobbsTime: number;
  make: string;
  model: string;
  rampedIn: boolean;
  grounded: boolean;
  groundedReason: string | null;
  year: string | null;
  categoryClass: string;
  fuelCapacity?: number | null;
  fuelMeasurement?: "gallons" | "liters" | null;
  cost?: PlaneCost;
}

export interface PlaneCost {
  id: number;
  dryRate: number | null;
  wetRate: number | null;
  billByHobbsTime: boolean;
  /**
   * This aircraft's own overnight minimum, in TENTHS per night away, overriding the
   * organization's figure.
   *
   * Null means inherit; 0 means explicitly exempt. Keep those apart or an org-wide minimum
   * reappears on the one aircraft a club excluded. See lib/overnight-minimum.ts.
   */
  overnightMinimumTenths?: number | null;
}

export interface Simulator {
  id: number;
  name: string;
  rampedIn: boolean;
  grounded: boolean;
  groundedReason?: string | null;
  /** Deci-hours, like Plane.hobbsTime/tachTime — divide by 10 to display. */
  tachTime?: number;
  hobbsTime?: number;
  cost?: SimulatorCost | null;
}

export interface SimulatorCost {
  id: number;
  /** Cents per hour. */
  rate: number | null;
  billByHobbsTime: boolean;
}

export interface Room {
  id: number;
  roomNumber: string;
}

export interface Location {
  id: number;
  name: string;
  /**
   * The airport's IANA zone, e.g. "America/Boise" — the operational truth a schedule is
   * pinned to. Null falls back to the organization's, then to the viewer's own, which is
   * exactly today's behaviour.
   */
  timeZone?: string | null;
  /**
   * The airport's postal address. The server GEOCODES this on create and on every edit,
   * and refuses the write when it cannot resolve the address, so it is effectively
   * required on both even though the column is a separate optional relation.
   */
  address?: UserAddress | null;
  showInDirectory?: boolean;
}

/**
 * Body for `PATCH /locations/:id`.
 *
 * Send the WHOLE address, never a diff: the server re-geocodes on every edit and writes
 * each address column from what it was handed, so an omitted city is written as an
 * omitted city. `timeZone: null` explicitly clears the zone (fall back to the org's);
 * omitting the key leaves it alone.
 */
export interface UpdateLocationInput {
  name: string;
  address: Partial<UserAddress>;
  timeZone?: string | null;
}

export interface Invoice {
  id: number;
  createdAt: string;
  voidedAt: string | null;
  paidAt: string | null;
  dueAt: string | null;
  total: number;
  subtotal: number;
  tax: number | null;
  memo: string | null;
  /** QuickBooks Sales Receipt id when synced. */
  qboSalesReceiptId?: string | null;
  qboSyncedAt?: string | null;
  qboSyncError?: string | null;
  items?: InvoiceItem[];
  customer?: OrganizationUser;
  reservation?: Reservation;
}

export interface InvoiceItem {
  id: number;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface OrganizationRating {
  id: number;
  name: string;
  defaultInstructorRate: number;
  anyInstructorCanTeach?: boolean;
  showInDirectory?: boolean;
}

/**
 * A currency RULE — "you may not fly this aircraft unless you're current on
 * this". The server enforces it at booking (`orgUserIsCurrentForResource`),
 * and applicability is decided by `resourceGroups`: a currency type with no
 * resource group attached matches no aircraft and therefore enforces nothing.
 */
export interface CurrencyType {
  id: number;
  name: string;
  description?: string | null;
  active?: boolean;

  // Expiration rules — days/months/on are alternative ways to say the same
  // thing; the server stores whichever was set.
  expiresInDays?: number | null;
  expiresInMonths?: number | null;
  expiresOn?: string | null;
  warningPeriodInDays?: number | null;
  /** A lapsed currency still permits the flight if a current instructor is aboard. */
  canFlyWithInstructor?: boolean;
  applyToAllGuests?: boolean;

  // Renewal rules — who may sign this off, besides an admin.
  dispatcherCanRenew?: boolean;
  instructorCanRenew?: boolean;
  canRenewSelf?: boolean;

  // Scope. Without `resourceGroups` the rule gates nothing.
  resourceGroups?: ResourceGroup[];
  orgUserGroups?: OrgUserGroup[];
  documentTypes?: DocumentType[];
}

/** Body for POST/PATCH /currencies/types — relations go as id arrays. */
export interface CurrencyTypeInput {
  name: string;
  description?: string | null;
  active?: boolean;
  expiresInDays?: number | null;
  expiresInMonths?: number | null;
  expiresOn?: string | null;
  warningPeriodInDays?: number | null;
  canFlyWithInstructor?: boolean;
  applyToAllGuests?: boolean;
  dispatcherCanRenew?: boolean;
  instructorCanRenew?: boolean;
  canRenewSelf?: boolean;
  resourceGroupIds?: number[];
  orgUserGroupIds?: number[];
  documentTypeIds?: number[];
}

/**
 * A set of resources a currency rule applies to. The `addNew*` flags make the
 * group self-maintaining — a newly added aircraft joins automatically.
 */
export interface ResourceGroup {
  id: number;
  name: string;
  description?: string | null;
  addNewResources?: boolean;
  addNewPlanes?: boolean;
  addNewRooms?: boolean;
  addNewSimulators?: boolean;
  resources?: Resource[];
}

export interface ResourceGroupInput {
  name: string;
  description?: string | null;
  addNewResources?: boolean;
  addNewPlanes?: boolean;
  addNewRooms?: boolean;
  addNewSimulators?: boolean;
  resourceIds?: number[];
}

/** A set of people a currency rule applies to, with the same auto-join flags. */
export interface OrgUserGroup {
  id: number;
  name: string;
  description?: string | null;
  addNewUsers?: boolean;
  addNewStudents?: boolean;
  addNewInstructors?: boolean;
  addNewRenters?: boolean;
  addNewTechnicians?: boolean;
  addNewDispatchers?: boolean;
  addNewAdmins?: boolean;
  addNewOwners?: boolean;
  orgUsers?: OrganizationUser[];
}

export interface OrgUserGroupInput {
  name: string;
  description?: string | null;
  addNewUsers?: boolean;
  addNewStudents?: boolean;
  addNewInstructors?: boolean;
  addNewRenters?: boolean;
  addNewTechnicians?: boolean;
  addNewDispatchers?: boolean;
  addNewAdmins?: boolean;
  addNewOwners?: boolean;
  orgUserIds?: number[];
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  expireAt: string | null;
  forRoles?: Role[] | null;
}

/**
 * One person's standing against a currency type.
 *
 * ⚠️ There is no `expiresAt` — the server model is startedAt / warnedAt /
 * expiredAt / archivedAt, and the server decides currency rather than the
 * client inferring it from a date. Per `checkIfCurrencyIsCurrent`, current
 * means: not expired, not archived, HAS a `renewedBy` (stamped on manual renew
 * or document upload), and — when the type expects documents — those documents
 * are attached. See `components/me/currency.ts`.
 */
export interface Currency {
  id: number;
  startedAt: string | null;
  /** Set once the warning period has been entered. */
  warnedAt: string | null;
  /** Set once it has lapsed; null does NOT by itself mean current. */
  expiredAt: string | null;
  archivedAt: string | null;
  notes?: string | null;
  /** Absent ⇒ never signed off ⇒ not current, regardless of dates. */
  renewedBy?: OrganizationUser | null;
  documents?: UserDocument[];
  currencyType?: CurrencyType;
  orgUser?: OrganizationUser;
}

export interface AppNotification {
  id: number;
  createdAt: string;
  readAt: string | null;
  title: string | null;
  /**
   * The body text. The server calls this `subtitle` (notification.subtitle), which is
   * the field GET /notifications actually returns — `body`/`message` were never on the
   * payload, so every notification rendered with its text missing.
   */
  subtitle?: string | null;
  /**
   * Where the notification points, e.g. "/announcements".
   *
   * A FLUTTER go_router location, not a console route — see `lib/notification-link.ts`,
   * which translates the shapes this console has a destination for and ignores the rest.
   */
  link?: string | null;
  body?: string | null;
  message?: string | null;
  type?: string | null;
}

/**
 * A reported discrepancy, and the two separate stamps it collects.
 *
 * Verifying and resolving are NOT the same act and the server keeps them apart: verifying
 * says somebody qualified reproduced the fault, resolving says the work is done. A squawk
 * can be resolved having never been verified, so never treat `verifiedAt` as a stage
 * `resolvedAt` must have passed through.
 *
 * `notes`, `resolvedBy` and `verifiedBy` are only populated by `GET /maintenance/squawks/:id`,
 * not by the list, so they are optional here.
 */
export interface Squawk {
  id: number;
  createdAt: string;
  /** Stamped by the server on create. Null on rows written before it existed. */
  reportedAt?: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  title: string | null;
  description: string | null;
  grounding?: boolean;
  /** What was done to clear it, written at resolve time. */
  notes?: string | null;
  /** When the work was actually finished, as opposed to when it was signed off. */
  completedAt?: string | null;
  resource?: Resource;
  reportedBy?: OrganizationUser;
  resolvedBy?: OrganizationUser | null;
  verifiedBy?: OrganizationUser | null;
}

/**
 * How much is left on an inspection, computed by the server on read.
 *
 * This console used to declare `dueAt` and `name` directly on the reminder and the server
 * never sent either, so every row said "Maintenance reminder — No due date" no matter what
 * was actually coming due. The countdown needs three things at once — the template's
 * interval, the reminder's starting point, and the aircraft's current meters — so it is
 * worked out once on the server rather than reassembled here. See
 * `server/src/utils/maintenanceDue.ts`.
 */
export interface MaintenanceDue {
  kind: "hours" | "days" | "date" | "unknown";
  /** `dueSoon` is the template's own warning period — the same threshold that emails. */
  status: "overdue" | "dueSoon" | "ok" | "resolved";
  name: string | null;
  notes: string | null;
  /** Whether coming due takes the aircraft off the line. */
  grounds: boolean;
  /** Null on a meter-based interval: nobody can know the date it'll be flown to. */
  dueAt: string | null;
  daysRemaining: number | null;
  basis: "tach" | "hobbs" | null;
  /** DECI-hours, like every meter field: 3000 is 300.0 on the clock. */
  dueAtHours: number | null;
  hoursRemaining: number | null;
  currentHours: number | null;
  /** 0 fresh, 1 due now, >1 overdue. Null when the interval can't be measured. */
  progress: number | null;
  /** Ascending is most-urgent-first, comparable across all three kinds. */
  urgency: number;
}

export interface MaintenanceReminder {
  id: number;
  createdAt: string;
  resolvedAt: string | null;
  startedAt: string | null;
  /** DECI-hours the interval started at. */
  startHours: number | null;
  completedAt: string | null;
  notes: string | null;
  due?: MaintenanceDue;
  template?: MaintenanceReminderTemplate;
  resource?: Resource;
}

/** The rule a reminder repeats on. One template spans many aircraft. */
export interface MaintenanceReminderTemplate {
  id: number;
  createdAt: string;
  name: string | null;
  notes: string | null;
  repeat: boolean;
  /** Ground the aircraft when this comes due. */
  ground: boolean;
  remindDays: number | null;
  remindDaysBefore: number | null;
  /** DECI-hours. */
  remindHours: number | null;
  remindHoursBefore: number | null;
  hourBasedOn: "tach" | "hobbs" | null;
  /** Set only on a one-off: a date that happens once and doesn't recur. */
  remindDate: string | null;
  resources?: Resource[];
  reminders?: MaintenanceReminder[];
}

/**
 * A ready-made inspection interval — the AVIATES set plus the common shop intervals.
 *
 * Served from `GET /maintenance/reminders/presets` rather than hard-coded here, so the
 * regulation text has one home across this console and the mobile app.
 */
export interface InspectionPreset {
  id: string;
  /** Which AVIATES letter this covers. Null for the presets outside the mnemonic. */
  letter: string | null;
  name: string;
  regulation: string | null;
  interval: string;
  /** Where the default doesn't apply to every aircraft — rendered as a caution. */
  caveat: string | null;
  ground: boolean;
  payload: CreateReminderTemplateInput;
}

export interface CreateReminderTemplateInput {
  name: string;
  notes?: string;
  repeat: boolean;
  ground?: boolean;
  remindDays?: number;
  remindDaysBefore?: number;
  /** DECI-hours. */
  remindHours?: number;
  remindHoursBefore?: number;
  hourBasedOn?: "tach" | "hobbs";
  /** A one-off deadline. The server forces `repeat: false` when this is set. */
  remindDate?: string;
  templateResources?: { id: number; startDate?: string; startHour?: number }[];
}

// ---- Mutation input payloads (see _local/insights/api-contract.md §4) ----

export interface CreateOrgInput {
  name: string;
  organizationType: string;
  details?: { phone?: string; email?: string; address?: Partial<UserAddress> };
}

export interface CreateLocationInput {
  name: string;
  address?: Partial<UserAddress>;
  showInDirectory?: boolean;
}

export interface CreatePlaneResourceInput {
  location: { id: number };
  type: {
    plane: {
      tailNumber: string;
      make?: string;
      model?: string;
      /** REQUIRED by the server — must be exactly 4 digits, e.g. "2018". */
      year: string;
      categoryClass: string;
      tachTime: number;
      hobbsTime: number;
      /** REQUIRED by the server — non-negative. */
      fuelCapacity: number;
      /** REQUIRED by the server — "gallons" or "liters". */
      fuelMeasurement: "gallons" | "liters";
      cost: { wetRate?: number; dryRate?: number; billByHobbsTime: boolean };
    };
  };
}

/** Create a simulator resource. tach/hobbs are deci-hours; rate is cents/hour. */
export interface CreateSimulatorResourceInput {
  location: { id: number };
  type: {
    simulator: {
      name: string;
      tachTime: number;
      hobbsTime: number;
      cost: { rate?: number; billByHobbsTime: boolean };
    };
  };
}

/** Create a room resource — only a room number is required. */
export interface CreateRoomResourceInput {
  location: { id: number };
  type: {
    room: {
      roomNumber: string;
    };
  };
}

// ------------------------------------------------------------------ documents

/** An org-defined document category (medical, photo ID, renter agreement…). */
export interface DocumentType {
  id: number;
  name: string;
  description?: string | null;
  /** Only admins may upload this type on a member's behalf. */
  restricted: boolean;
  /** When true, an `expiresAt` is required at upload. */
  expires: boolean;
  /** Inactive types stay on existing documents but aren't offered for new uploads. */
  active: boolean;
  /** Days before expiry to start warning. Only meaningful when `expires` is true. */
  warningPeriod?: number | null;
}

/**
 * Create/edit payload for a document type. `warningPeriod` is required by the server
 * whenever `expires` is true, and is nulled out server-side when `expires` goes false.
 */
export interface DocumentTypeInput {
  name: string;
  description?: string | null;
  restricted: boolean;
  expires: boolean;
  active: boolean;
  warningPeriod?: number | null;
}

/**
 * Roles an API key may be granted. Mirrors the server's API_KEY_ROLES.
 *
 * `owner` is absent on purpose: it can delete the organization and change
 * billing, so it stays with a person.
 */
export const API_KEY_ROLES = [
  "admin",
  "dispatcher",
  "instructor",
  "student",
  "renter",
  "technician",
] as const;

export type ApiKeyRole = (typeof API_KEY_ROLES)[number];

/**
 * A credential that lets software act on the organization's behalf.
 *
 * Never carries the secret — the server stores only a hash, so after creation
 * there is nothing to return. `prefix` is the displayable head, enough to tell
 * two keys apart and not enough to reconstruct one.
 */
export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  roles: ApiKeyRole[];
  status: "active" | "expired" | "revoked";
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdBy?: { id: number; user?: { id: number; name: string } | null } | null;
}

/**
 * The response to creating a key. `secret` appears here and in no other
 * response, ever — if the user navigates away without copying it, the only
 * remedy is to revoke and mint another.
 */
export interface ApiKeyWithSecret extends Omit<ApiKey, "status" | "revokedAt" | "lastUsedAt"> {
  secret: string;
}

export interface ApiKeyInput {
  name: string;
  roles: ApiKeyRole[];
  expiresAt?: string | null;
}

/** A member's uploaded document. `fileUrls` are short-lived signed URLs (view/download). */
export interface UserDocument {
  id: number;
  createdAt: string;
  expiresAt: string | null;
  archivedAt: string | null;
  fileUrls: string[];
  documentType: DocumentType;
}

// ------------------------------------------------------------------ reports

/** A per-day point in an org report series (count = reservations, or deci-hours for time). */
export interface ReportPoint {
  date: string;
  count: number;
}

/** Money totals (cents) from `/reports/organization/countPendingAndProcessedPayments`. */
export interface ReportPayments {
  pending: number;
  processed: number;
}

/** A pending request from a user to join the org (via the org's join code). */
export interface JoinRequest {
  id: number;
  status?: string;
  createdAt?: string;
  user: { id: number; name: string; email: string };
}

export interface InviteInput {
  email: string;
  admin?: boolean;
  instructor?: boolean;
  student?: boolean;
  renter?: boolean;
  technician?: boolean;
  dispatcher?: boolean;
  orgUserGroupIds?: number[];
  /** Tier to put them on when they accept. Applied as `pending` — nothing is charged. */
  membershipPlanId?: number | null;
}

export interface PersonRef {
  id: number;
}

export interface CreateReservationInput {
  title: string;
  type: ReservationType;
  start: string;
  end: string;
  timeZoneName: string;
  notes?: string;
  rrule?: string;
  location?: { id: number };
  resource?: { id: number };
  rating?: { id: number };
  personnel?: {
    instructors?: PersonRef[];
    students?: PersonRef[];
    renters?: PersonRef[];
    guests?: { id?: number; name: string; email: string; phone?: string }[];
  };
  /**
   * Optional. When present the server creates a repeating booking — one real
   * reservation per occurrence — instead of the single one described by
   * `start`/`end`, and returns `{ seriesId, reservations, occurrences }`.
   *
   * All or nothing: if any occurrence clashes, nothing is created and the error
   * names the offending dates.
   */
  recurrence?: RecurrenceInput;
}

export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

/**
 * How a monthly rule picks its day.
 * - `dayOfMonth`  — "the 27th of every month"
 * - `nthWeekday`  — "the fourth Monday"
 * - `lastWeekday` — "the last Monday", which differs from "the fourth" in any month
 *                   with five Mondays
 */
export type MonthlyMode = "dayOfMonth" | "nthWeekday" | "lastWeekday";

/** A repeat rule. Times and days are expressed in `timeZoneName`. */
export interface RecurrenceInput {
  frequency: RecurrenceFrequency;
  /** Every N days / weeks / months / years. */
  interval: number;
  /** 0 = Sunday … 6 = Saturday. Weekly rules only. */
  daysOfWeek?: number[];
  /** Monthly rules only. Defaults server-side to `dayOfMonth`. */
  monthlyMode?: MonthlyMode;
  /** Local wall clock, "HH:mm". */
  startTime: string;
  durationMins: number;
  timeZoneName: string;
  /** First local date an occurrence may fall on, "YYYY-MM-DD". */
  startDate: string;
  /** Inclusive last local date. Mutually exclusive with `count`. */
  until?: string | null;
  /** How many to create. Mutually exclusive with `until`. */
  count?: number | null;
}

/** The stored rule behind a repeating booking, as it comes back on a reservation. */
export interface ReservationSeries {
  id: number;
  frequency: string;
  monthlyMode?: MonthlyMode | null;
  interval: number;
  daysOfWeek: number[];
  startTime: string;
  durationMins: number;
  timeZoneName: string;
  startDate?: string | null;
  /**
   * The human sentence for this rule, rendered server-side at creation ("Monthly on the
   * fourth Monday"). Prefer it over re-deriving the wording here — it is what stops the
   * console and the app describing the same rule differently. Null on series created
   * before it existed, which is why `describeSeries` still has a fallback.
   */
  label?: string | null;
  until: string | null;
  occurrences: number;
}

/** What the server returns when a repeating booking is created. */
export interface CreatedSeries {
  seriesId: number;
  reservations: number[];
  occurrences: number;
}

/**
 * "Weekly on Tue" / "Monthly on the fourth Monday" — for a badge or a summary line.
 *
 * Uses the server's stored `label` when there is one, which is the whole point of
 * storing it: the wording is decided in one place and every surface repeats it.
 * The fallback below only ever runs for series created before that column existed —
 * all of which are weekly, which is why it only knows how to say "weekly".
 */
export function describeSeries(
  series: Pick<ReservationSeries, "interval" | "daysOfWeek"> & { label?: string | null }
): string {
  if (series.label) return series.label;

  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [...new Set(series.daysOfWeek)].sort((a, b) => a - b).map((d) => names[d] ?? "?");
  const cadence = series.interval === 1 ? "Weekly" : `Every ${series.interval} weeks`;
  return days.length ? `${cadence} on ${days.join(", ")}` : cadence;
}

/**
 * Ramp-out readings — `hobbsTimeOut` and `tachTimeOut` are both required by the server
 * (decimal-hour meter readings, sent verbatim). `comments[0]` is appended to the review.
 */
export interface RampOutInput {
  hobbsTimeOut: number;
  tachTimeOut: number;
  comments?: string[];
}

/**
 * Ramp-in readings — `hobbsTimeIn`/`tachTimeIn` are the ending meter readings; `briefing`
 * is instruction time (decimal hours). `comments[0]` is appended to the review.
 *
 * EVERY FIELD IS OPTIONAL, because a booking with no aircraft has no meters to send. The
 * server has always supported this — `ReservationService.rampIn` passes each field straight
 * to Prisma, where `undefined` means "leave it alone", and its own comment says so ("For
 * reservations that don't have a resource, we will only update the briefing"). It is what
 * the Flutter app sends for a ground lesson.
 *
 * Typing the meters as required was therefore a client-side invention, and it did real
 * damage: it forced the ramp modal to bail out before calling this at all when the readings
 * were null, so a ground lesson could not be closed out from the console.
 */
export interface RampInInput {
  hobbsTimeIn?: number;
  tachTimeIn?: number;
  briefing?: number;
  comments?: string[];
}

/**
 * Correct readings already recorded on a flight, via `POST /reservations/:id/updateReviewTimes`.
 * Every figure is in TENTHS of an hour, like the ramp fields it is rewriting.
 *
 * SEND A PAIR OR NEITHER. The server treats one Hobbs field arriving as a request to
 * rewrite both, and refuses with "Hobbs time in is required" if its partner is missing.
 * The same rule applies to tach.
 */
export interface CorrectReviewTimesInput {
  hobbsTimeOut?: number;
  hobbsTimeIn?: number;
  tachTimeOut?: number;
  tachTimeIn?: number;
  briefing?: number;
}

/**
 * The overrides `POST /reservations/:id/paymentOverrides` will actually price with.
 *
 * Deliberately narrower than the stored record: only the two rates the engine reads are
 * offered. Null clears that one figure back to the school's rate card. The endpoint
 * refuses a body where everything is null ("No overrides provided"), so at least one has
 * to carry a number.
 */
export interface ReservationPaymentOverridesInput {
  instructorRateOverride?: number | null;
  resourceRateOverride?: number | null;
}

/** Sign off a flight review with the caller's 4-character PIN. */
export interface ConfirmReviewInput {
  pin: string;
}

/**
 * Close out a guest reservation (no PIN — guests never confirm). An admin, the instructor,
 * or the creator reviews it; `guestOverrides` optionally corrects the guest's contact details
 * before the invoice is emailed to them.
 */
export interface ConfirmReviewGuestInput {
  guestOverrides?: { id?: number; name?: string; email?: string; phone?: string };
}

// ------------------------------------------------------------------ billing / Stripe

/** A card saved on the member's Stripe customer (as returned by GET /stripe/paymentMethods). */
export interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  } | null;
  /** Flagged by the server when this is the customer's default (autopay) method. */
  defaultPaymentMethod?: boolean;
}

/**
 * Everything the web Payment Element needs to charge an invoice on the org's connected
 * account (GET /stripe/invoice/:invoiceId). The PaymentIntent lives on `orgStripeAccountId`.
 */
export interface InvoicePaymentIntent {
  paymentIntentClientSecret: string;
  ephemeralKey: string;
  customerId: string;
  orgStripeAccountId: string;
}

/** Client secret + connected account for a card SetupIntent (POST /stripe/setupIntent). */
export interface SetupIntentResponse {
  clientSecret: string;
  orgStripeAccountId: string;
}

/** The member's own billing settings (GET /orgUsers/billing). */
export interface OrgUserBillingSettings {
  stripeCustomerId: string;
  autoPay: boolean;
}

export interface CreateInvoiceInput {
  /** Bill a member. Mutually exclusive with `guest`. */
  customer?: { id: number };
  /** Bill someone who is not a member, by name and email. Mutually exclusive with `customer`. */
  guest?: { name: string; email: string };
  memo?: string;
  dueAt?: string;
  dueIn?: number;
  items: { name: string; qty: number; unitPrice: number }[];
}

export type DayBlocks = { start: string; end: string }[];

/**
 * A free (bookable) time window returned by the availability endpoints
 * (`/availability/resource/:id`, `/availability/user/:userId`). These are the
 * INVERSE of existing reservations — the server has already subtracted booked
 * time — spanning roughly [yesterday, +1 year]. An empty array means fully booked.
 */
export interface AvailabilityWindow {
  start: string; // ISO
  end: string; // ISO
}

export interface AvailabilityInput {
  monday?: DayBlocks;
  tuesday?: DayBlocks;
  wednesday?: DayBlocks;
  thursday?: DayBlocks;
  friday?: DayBlocks;
  saturday?: DayBlocks;
  sunday?: DayBlocks;
}

/** Convenience: resolve a resource's display name + kind. */
export function resourceLabel(r: Resource): { name: string; kind: "Aircraft" | "Simulator" | "Room" | "Resource" } {
  const t = r.type;
  if (t?.plane) return { name: t.plane.tailNumber, kind: "Aircraft" };
  if (t?.simulator) return { name: t.simulator.name, kind: "Simulator" };
  if (t?.room) return { name: `Room ${t.room.roomNumber}`, kind: "Room" };
  return { name: `Resource #${r.id}`, kind: "Resource" };
}

/* ── Audit trail ─────────────────────────────────────────────────────────────── */

/**
 * One thing somebody did, as the server recorded it.
 *
 * `entityType`/`entityId` carry no `FK_` prefix deliberately — the response middleware
 * deletes every `FK_*` field, and these two are what link an entry back to its booking.
 * The relations arrive nested for the same reason.
 */
export interface AuditEvent {
  id: number;
  createdAt: string;
  /** "reservation.rescheduled", "reservation.cancelled", … */
  action: string;
  entityType: string;
  entityId: number;
  /** A finished sentence, written server-side: "Moved 10:00 AM → 11:00 AM". */
  summary: string | null;
  /** Only the fields that moved. Shape is `{ field: { from, to } }`. */
  changes: Record<string, { from: unknown; to: unknown }> | null;
  /** web | ios | api | system — null when we couldn't tell. */
  source: string | null;
  /** Null for system-originated events (cron, webhooks). */
  actor: { id: number; user?: User } | null;
  /** The member the event is about, which is usually not the actor. */
  subject: { id: number; user?: User } | null;
  resource: Resource | null;
}

/* ── Cancellations (F12) ─────────────────────────────────────────────────────── */

/**
 * Which occurrences a cancel applies to, for a booking in a repeating series.
 * Google Calendar's three choices. Meaningless — and ignored — for a one-off.
 */
export type CancelScope = "this" | "following" | "all";

/** One option in the fixed list of cancellation reasons, served by the API. */
export type CancellationCategory = {
  value: string;
  label: string;
  group: "operational" | "customer" | "weather" | "other";
};

export type CancelledReservation = {
  id: number;
  title: string;
  type: string;
  start: string;
  end: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationCategory: string | null;
  /** Resolved server-side, so "Not recorded" reads the same everywhere. */
  categoryLabel: string;
  /** Cancelled with less than 24 hours' notice — including after the fact. */
  isLate: boolean;
  resource?: {
    id: number;
    type?: {
      plane?: { tailNumber: string; make: string; model: string } | null;
      room?: { roomNumber: string } | null;
      simulator?: { name: string } | null;
    } | null;
  } | null;
  cancelledBy?: { id: number; user?: { id: number; name: string } | null } | null;
  personnel?: {
    students?: Array<{ id: number; user?: { id: number; name: string } | null }> | null;
    instructors?: Array<{ id: number; user?: { id: number; name: string } | null }> | null;
    renters?: Array<{ id: number; user?: { id: number; name: string } | null }> | null;
  } | null;
};

export type CancellationReport = {
  cancellations: CancelledReservation[];
  summary: {
    total: number;
    /** Every booking in the window, cancelled or not — the denominator for `rate`. */
    totalInWindow: number;
    /** 0–1. Already guarded against an empty window server-side. */
    rate: number;
    late: number;
    lateWithinHours: number;
    byCategory: Array<{ value: string; label: string; count: number; late: number }>;
  };
};

/**
 * The tail number, room or simulator name on a cancelled booking.
 *
 * Separate from `resourceLabel` above because the report's rows carry a trimmed-down
 * resource (no id-derived fallback to fall back to), and an em dash reads better than
 * "Resource #undefined" in a table of things that didn't happen.
 */
export function cancelledResourceLabel(r: CancelledReservation["resource"]): string {
  const t = r?.type;
  if (t?.plane) return t.plane.tailNumber;
  if (t?.room) return `Room ${t.room.roomNumber}`;
  if (t?.simulator) return t.simulator.name;
  return "—";
}

/** Whoever the booking was for — the person a cancellation is actually about. */
export function cancelledForLabel(r: CancelledReservation): string {
  const names = [
    ...(r.personnel?.students ?? []),
    ...(r.personnel?.renters ?? []),
    ...(r.personnel?.instructors ?? []),
  ]
    .map((p) => p.user?.name)
    .filter(Boolean) as string[];

  return names.length ? names.join(", ") : "—";
}

/* ── Revenue reports ─────────────────────────────────────────────────────────
 * One shape behind every revenue tab. Adding "by instructor" or "by student" to the
 * UI is a new tab reading the same endpoint with a different `groupBy` — the server
 * already returns all four.
 */

export type RevenueDimension = "aircraft" | "instructor" | "student" | "instructionType";

export type RevenueRow = {
  key: string;
  label: string;
  sublabel: string | null;
  invoices: number;
  /** Cents raised in the window. Voided invoices are excluded server-side. */
  billed: number;
  /** Of that, cents actually paid. */
  collected: number;
  /** Deci-hours, matching the invoice column — divide by 10 to display. */
  resourceHours: number;
};

export type RevenueReport = {
  groupBy: RevenueDimension;
  rows: RevenueRow[];
  months: Array<{ month: string; total: number }>;
  totals: { invoices: number; billed: number; collected: number; resourceHours: number };
};

/**
 * What PATCH /invoices/:id accepts.
 *
 * Intent, not timestamps — the server has to void/pay through Stripe as well as the row,
 * and records which org user did it. A body of `{ paidAt }` is silently ignored AND
 * answered with 200, so this type exists to make that mistake unrepresentable.
 */
export type InvoiceUpdate = { markPaid: true } | { markVoided: true };

/* ── Global search ───────────────────────────────────────────────────────────
 * `GET /search` flattens every entity to ONE row shape so the palette can render
 * a squawk and a currency without knowing either. The server decides both which
 * types this caller may search and which rows within them they may see — never
 * re-filter by role here, and never assume a type is present just because it
 * exists (`types` is the caller's real category list).
 */

export type SearchEntityType =
  | "person"
  | "resource"
  | "location"
  | "rating"
  | "reservation"
  | "announcement"
  | "currency"
  | "document"
  | "squawk"
  //Training. `course` is the syllabus library and only reaches someone who may configure
  //training; the other two are per-person and are narrowed to the viewer's own unless
  //they teach or administer — so never assume any of the three is in `types`.
  | "course"
  | "enrollment"
  | "endorsement";

export interface SearchResult {
  type: SearchEntityType;
  id: number;
  title: string;
  subtitle: string | null;
  /** ISO-8601, unformatted on purpose — render it with `timeZone` below. */
  date: string | null;
  /** What `date` means: "Starts", "Expires", "Reported"… */
  dateLabel: string | null;
  /** IANA zone to render `date` in; null means the viewer's own. */
  timeZone: string | null;
  /** Status chip: "Open", "Expired", "Cancelled", "Grounded". */
  badge: string | null;
  /** Ids for deep-linking — see `lib/search-links.ts`. */
  params: Record<string, number | string>;
}

export interface SearchResponse {
  q: string;
  /** Every type this caller may search — the category list, not just what came back. */
  types: SearchEntityType[];
  counts: Partial<Record<SearchEntityType, number>>;
  results: SearchResult[];
}

// ── Cost splitting ───────────────────────────────────────────────────────────
/**
 * How an organization divides the cost of a booking between the people on it.
 *
 * The vocabulary is SERVED rather than hardcoded (`GET /organizations/splitRules`
 * returns `apportionments`, `chargeLines`, `presets`, `copy` and worked `examples`
 * alongside the rules). That is deliberate: the server's engine is the authority on
 * what these mean, and a client that kept its own list would eventually offer a rule
 * the server rejects — or describe one differently from the way it actually bills.
 *
 * These string unions exist for editor help only. Treat a value that isn't in them as
 * data, not an error: it means the server is newer than this build.
 */
export type Apportionment = "whole" | "equal" | "measured" | "full_to_each" | "weighted";

export type ChargeLine = "aircraft" | "instruction";

export type SplitRuleRow = {
  id: number;
  /** null = the organization-wide default for this charge. */
  reservationType: string | null;
  chargeLine: string;
  apportionment: string;
};

/** Where a resolved rule came from — drives the "Default" vs "Set by you" badge. */
export type SplitRuleSource = "override" | "type_rule" | "org_default" | "product_default";

export type SplitPlan = {
  lines: Record<ChargeLine, Apportionment>;
  sources: Record<ChargeLine, SplitRuleSource>;
};

export type WorkedExamplePayer = {
  name: string;
  hours: string;
  amount: string;
  free?: boolean;
};

export type WorkedExample = {
  chargeLine: ChargeLine;
  apportionment: Apportionment;
  scenario: string;
  perPayer: WorkedExamplePayer[];
  total: string;
  totalNote: string;
  /** Present instead of figures when this rule would refuse to price the example. */
  refusal?: string;
};

export type SplitPreset = {
  key: string;
  label: string;
  summary: string;
  rules: {
    reservationType: string | null;
    chargeLine: ChargeLine;
    apportionment: Apportionment;
    rationale: string;
  }[];
};

export type SplitRulesDescription = {
  rules: SplitRuleRow[];
  /** The effective plan for every bookable type, already resolved server-side. */
  resolved: Record<string, SplitPlan>;
  productDefault: Apportionment;
  apportionments: Apportionment[];
  chargeLines: ChargeLine[];
  bookableTypes: string[];
  personnelLimits: Record<string, Record<string, number>>;
  examples: WorkedExample[];
  copy: {
    apportionments: Record<Apportionment, { label: string; blurb: string; bestFor: string }>;
    chargeLines: Record<ChargeLine, { label: string; blurb: string }>;
  };
  presets: SplitPreset[];
};

/**
 * What each person on a booking was doing, and what they owe.
 *
 * `pilotRole` is the AUDIT half and prices nothing. Two pilots on one flight log different
 * things, and under 14 CFR 61.51(e) both may log PIC — the sole manipulator of the controls
 * and the acting pilot in command — so logged time across a crew can legitimately exceed the
 * airframe's Hobbs. The meter fields must sum to what the aircraft ran; the role doesn't
 * constrain them, and it is deliberately not coupled to whether somebody is billed.
 */
export const PILOT_ROLES = ["pic", "safety_pilot", "sic", "passenger"] as const;

export type PilotRole = (typeof PILOT_ROLES)[number];

export type ReservationPayerInput = {
  /** Exactly one of these. */
  orgUserId?: number | null;
  guestId?: number | null;
  /** Percentage share in basis points — 6000 is 60%. */
  weightBps?: number | null;
  /** This person's own readings, in TENTHS of an hour (the unit the meters use). */
  hobbsOut?: number | null;
  hobbsIn?: number | null;
  tachOut?: number | null;
  tachIn?: number | null;
  instructionMinutes?: number | null;
  waived?: boolean | null;
  waivedReason?: string | null;
  pilotRole?: PilotRole | null;
};

/** A stake as the server returns it, with the person hydrated. */
export type ReservationPayer = ReservationPayerInput & {
  id: number;
  orgUser?: { id: number; user?: { id: number; name: string } | null } | null;
  guest?: { id: number; name: string } | null;
};

//---------------------------------------------------------------------------------
// Training — courses, syllabi, enrollments and the requirement ledger
//
// Hours are DECI-HOURS (tenths) everywhere, matching the server and the meters.
// `deciHoursLabel` in lib/training.ts is the only thing that should turn them into
// something a human reads.
//
// Note the plain `requirementId` / `lessonId` fields rather than `FK_*`: every FK_
// column is stripped at the response boundary, so the server re-exposes the ones a
// screen has to join on under these names. See the note above `asCredit` in
// server/src/services/curriculum.service.ts.
//---------------------------------------------------------------------------------

export const REGULATORY_PARTS = ["part61", "part141"] as const;
export type RegulatoryPart = (typeof REGULATORY_PARTS)[number];

export const LESSON_KINDS = ["ground", "flight", "sim"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export type CreditFrom = "flight" | "instruction" | "count";

/** One mark on a course's scale, and whether earning it means the lesson is done. */
export type GradeOption = { code: string; passing: boolean };

export type CourseVersionSummary = {
  id: number;
  label: string;
  publishedAt: string | null;
  approvedAt: string | null;
  approvalReference?: string | null;
  retiredAt: string | null;
  /**
   * The course's marks, in display order. ALWAYS a list of codes.
   *
   * The column behind it holds two shapes (a bare list, or `{code, passing}` rows once a
   * school has saved its own scale) and the server flattens it here so a grade picker can
   * be built from it without knowing that. It used to arrive raw, so the moment a school
   * pressed "Save scale" this array became objects and every grade dropdown rendered them.
   * Read `gradeOptions` when you need to know what a mark MEANS.
   */
  gradingScale?: string[] | null;
  /** The same marks, with the school's own pass decision on each. */
  gradeOptions?: GradeOption[] | null;
  _count?: { enrollments: number };
};

/**
 * The course's marks as a picker should offer them, from whatever a payload carries.
 *
 * Belt and braces: the server now always sends `gradingScale` as codes, but a console
 * deploy can land ahead of a server one, and this is the exact spot where getting it wrong
 * renders `[object Object]` in a dropdown an instructor has to grade from.
 */
export function gradeCodesOf(
  source: { gradingScale?: unknown; gradeOptions?: GradeOption[] | null } | null | undefined
): string[] {
  const options = source?.gradeOptions;
  if (Array.isArray(options) && options.length) return options.map((g) => String(g.code));

  const raw = source?.gradingScale;
  if (!Array.isArray(raw) || raw.length === 0) return ["S", "U", "I"];
  return raw
    .map((g) =>
      typeof g === "string" ? g : String((g as { code?: unknown } | null)?.code ?? "")
    )
    .map((code) => code.trim())
    .filter((code) => code.length > 0);
}

export type Course = {
  id: number;
  name: string;
  description: string | null;
  regulatoryPart: RegulatoryPart;
  certificateSought: string | null;
  archivedAt: string | null;
  /** How long the school plans this course to take. Drives the pace read and nothing else. */
  targetDays: number | null;
  rating?: { id: number; name: string; defaultInstructorRate: number } | null;
  versions: CourseVersionSummary[];
  _count?: { versions: number };
  /** What the school charges to enroll, in cents. Null for a free course. */
  enrollmentFeeCents?: number | null;
  /** How the fee reads on the invoice line. Capped at 60 by `invoice_item.name`. */
  enrollmentFeeLabel?: string | null;
};

export type LessonTask = {
  id: number;
  name: string;
  position: number;
  acsCode: string | null;
  standard: string | null;
};

export type LessonCredit = { id: number; creditFrom: CreditFrom; requirementId: number };

export type SyllabusLesson = {
  id: number;
  name: string;
  position: number;
  kind: LessonKind;
  objectives: string | null;
  completionStandards: string | null;
  minFlightDeciHours: number | null;
  minGroundDeciHours: number | null;
  requiresSignoff: boolean;
  requiresNotes: boolean;
  tasks: LessonTask[];
  creditsWhat: LessonCredit[];
};

export type CourseStage = {
  id: number;
  name: string;
  objective: string | null;
  position: number;
  requiresStageCheck: boolean;
  lessons: SyllabusLesson[];
};

export type CourseRequirement = {
  id: number;
  code: string;
  label: string;
  minDeciHours: number | null;
  minCount: number | null;
  source: "part61" | "part141" | "school";
  maxSimulatorBps: number | null;
  maxTransferBps: number | null;
  /**
   * Training older than this many CALENDAR months stops counting toward this requirement.
   *
   * Missing from this type was why the syllabus editor could not round-trip it: the editor
   * never read it, so it never sent it, and the server treats an absent value as "clear the
   * window" — meaning editing a requirement's label silently deleted it.
   */
  recencyCalendarMonths: number | null;
};

export type CourseVersion = CourseVersionSummary & {
  course: Course;
  stages: CourseStage[];
  requirements: CourseRequirement[];
};

export type EnrollmentStatus = "enrolled" | "graduated" | "terminated" | "transferred";

export type EnrollmentSummary = {
  id: number;
  status: EnrollmentStatus;
  enrolledAt: string;
  graduatedAt: string | null;
  terminatedAt: string | null;
  transferredAt: string | null;
  certifiedAt: string | null;
  /** The fee AS IT STOOD when this student enrolled, in cents. Not the course's price today. */
  feeCents?: number | null;
  feeStatus?: "none" | "owed" | "invoiced";
  /** Re-exposed under a plain name; `FK_feeInvoiceId` is stripped at the response boundary. */
  feeInvoiceId?: number | null;
  student?: { id: number; user?: { id: number; name: string; email: string } | null } | null;
  courseVersion?: {
    id: number;
    label: string;
    publishedAt: string | null;
    course: { id: number; name: string; regulatoryPart: RegulatoryPart; certificateSought: string | null; enrollmentFeeCents?: number | null; enrollmentFeeLabel?: string | null };
  } | null;
  _count?: { lessonRecords: number };
};

export type LessonTaskGrade = { id: number; grade: string; notes: string | null; lessonTaskId: number };

export type LessonRecord = {
  id: number;
  grade: string | null;
  notes: string | null;
  flightDeciHours: number | null;
  instructionDeciHours: number | null;
  simulatorDeciHours: number | null;
  instructorSignedAt: string | null;
  studentSignedAt: string | null;
  createdAt: string;
  lessonId: number;
  reservationId: number | null;
  supersedesId: number | null;
  instructorOrgUserId: number | null;
  instructor?: { id: number; user?: { id: number; name: string } | null } | null;
  taskGrades: LessonTaskGrade[];
};

export type RequirementCredit = {
  id: number;
  createdAt: string;
  deciHours: number | null;
  count: number | null;
  source: "lesson" | "transfer_141" | "transfer_61" | "simulator" | "manual" | "reversal";
  notes: string | null;
  requirementId: number;
  lessonRecordId: number | null;
  reversesId: number | null;
};

/** What the ledger adds up to against one requirement, after any ceiling. */
export type Standing = {
  requirementId: number;
  code: string;
  label: string;
  requiredDeciHours: number | null;
  requiredCount: number | null;
  creditedDeciHours: number;
  creditedCount: number;
  /** Before the ceiling — so the UI can explain a difference rather than just show a smaller number. */
  rawDeciHours: number;
  disallowedDeciHours: number;
  cappedBy: "simulator" | "transfer" | null;
  remaining: number;
  met: boolean;
  /** Only an FAA-sourced shortfall can block a Part 141 graduation. */
  faaSourced: boolean;
  /** Hours flown that no longer count because they fell outside the requirement's window. */
  staleDeciHours: number;
  staleCount: number;
  /** The window, so the UI can say why without re-deriving the rule. Null = never stale. */
  recencyCalendarMonths: number | null;
};

export type EnrollmentProgress = {
  enrollment: EnrollmentSummary & {
    studentOrgUserId: number;
    courseVersionId: number;
    enrollmentCertificateNumber: string | null;
    graduationCertificateNumber: string | null;
    terminationReason: string | null;
    lessonRecords: LessonRecord[];
    credits: RequirementCredit[];
    courseVersion: CourseVersion;
  };
  standings: Standing[];
  lessonsTotal: number;
  lessonsComplete: number;
  completedLessonIds: number[];
  /** Advisory only — never gates anything. */
  pace: Pace;
  /** Non-null means graduation is refused, and this is why. */
  graduationBlocker: string | null;
};

export type Endorsement = {
  id: number;
  templateCode: string | null;
  title: string;
  /** As signed. Never re-rendered — the AC gets revised and this must not. */
  renderedText: string;
  signedAt: string;
  expiresAt: string | null;
  signerCertificateNumber: string | null;
  orgUserId: number;
  signedByOrgUserId: number;
  enrollmentId: number | null;
  supersedesId: number | null;
  student?: { id: number; user?: { id: number; name: string; email: string } | null } | null;
  signedBy?: { id: number; user?: { id: number; name: string } | null } | null;
};

export type EndorsementTemplate = {
  code: string;
  title: string;
  regulation: string;
  /** The student's name is already substituted; other `{placeholders}` are the signer's to fill. */
  body: string;
  expiresInDays: number | null;
  group: "presolo" | "solo" | "crossCountry" | "test" | "privileges";
};

export type PaceStatus = "onTrack" | "atRisk" | "behind" | "stalled" | "unknown";

export type Pace = {
  status: PaceStatus;
  reason: string | null;
  daysSinceLastLesson: number | null;
  expectedFraction: number | null;
  actualFraction: number;
};

export type CurriculumTemplateSummary = {
  key: string;
  name: string;
  description: string;
  certificateSought: string;
  stages: number;
  lessons: number;
  requirements: number;
};

/**
 * A lesson this booking could be closing out.
 *
 * A SUBSET of `SyllabusLesson`, not the whole thing. The candidates endpoint selects the
 * few columns a grader needs, so declaring it as the full lesson promised fields (its
 * objectives, its completion standards, what it credits) that never arrive, and any code
 * reading one would have got `undefined` with the type insisting otherwise.
 */
export type CandidateLesson = Pick<
  SyllabusLesson,
  | "id"
  | "name"
  | "position"
  | "kind"
  | "minFlightDeciHours"
  | "minGroundDeciHours"
  | "requiresNotes"
> & {
  stageName: string;
  stagePosition: number;
  complete: boolean;
  /**
   * The ACS tasks this lesson is made of, in syllabus order. Each one can carry its own
   * grade on the record, which is what `taskGrades` refers to.
   *
   * Optional because a school writing its own syllabus need not break a lesson into tasks
   * at all, and because a console running against a server older than this field gets none.
   */
  tasks?: LessonTask[];
};

export type CandidateEnrollment = {
  enrollmentId: number;
  course: { id: number; name: string; regulatoryPart: RegulatoryPart };
  versionLabel: string;
  /**
   * The course's own marks, so the close-out grader offers what the course actually uses.
   * It used to offer a hard-coded S/U/I, which the server then refused for any school on
   * its own scale: the one grader most instructors ever touch could not grade their course.
   */
  gradingScale?: string[] | null;
  gradeOptions?: GradeOption[] | null;
  lessons: CandidateLesson[];
};

/** One of the four grants, as the server describes it. */
export type TrainingGrantOption = {
  grant: string;
  label: string;
  description: string;
  /** Only `checkInstructor` — §141.37 designates per approved course. */
  courseScoped: boolean;
};

export type TrainingGrant = {
  id: number;
  grant: string;
  createdAt: string;
  /** Re-exposed by the read model; `FK_courseId` never survives the response boundary. */
  orgUserId: number;
  courseId: number | null;
  orgUser?: { id: number; user?: { id: number; name: string | null; email: string | null } | null } | null;
  course?: { id: number; name: string } | null;
  grantedBy?: { user?: { name: string | null } | null } | null;
};

export type MyTrainingGrants = {
  grants: { grant: string; courseId: number | null }[];
  /** What the caller's role already gives them, so a client never re-derives the bypass. */
  implied: string[];
  canGrade: boolean;
};

//=========================================================================================
// Membership
//
// FK_-prefixed fields survive here because memberships are read through routes that do NOT
// strip them — see [[aerscheduler-fk-strip]]; the console reads `FK_joinFeeInvoiceId` to
// link at the invoice. Everything money is CENTS, matching the rest of the API.
//=========================================================================================

export type DuesInterval = "monthly" | "quarterly" | "annual";

export type MembershipStatus = "pending" | "active" | "suspended" | "cancelled";

/** What happened to one dues period. See utils/membership.ts on the server. */
export type MembershipChargeStatus = "pending" | "billed" | "waived" | "failed";

export type MembershipPlan = {
  id: number;
  name: string;
  description: string | null;
  archivedAt: string | null;
  joinFeeCents: number | null;
  joinFeeLabel: string | null;
  duesCents: number | null;
  duesLabel: string | null;
  duesInterval: DuesInterval;
  duesDayOfMonth: number | null;
  prorateFirstPeriod: boolean;
  autoBillDues: boolean;
  /** Days to pay a dues or join-fee invoice. Null means no due date. A term of the money,
   *  so it is snapshotted onto the membership at join. */
  duesDueInDays: number | null;
  /** How far ahead a member on this tier may book. Null means no limit. An ENTITLEMENT, so
   *  it is read live off the plan — relaxing it relaxes it for everyone immediately. */
  bookingWindowDays: number | null;
  FK_agreementDocumentTypeId: number | null;
  agreementDocumentType?: { id: number; name: string } | null;
  /** Live memberships on this plan — not its history. */
  memberCount: number;
};

/** The narrow shape the invite and join-request pickers read. */
export type MembershipPlanOption = {
  id: number;
  name: string;
  joinFeeCents: number | null;
  duesCents: number | null;
  duesInterval: DuesInterval;
};

/** One plan's rate for one aircraft, in cents per hour. Wet wins over dry. */
export type MembershipPlanRate = {
  resourceId: number;
  dryRate: number | null;
  wetRate: number | null;
};

export type MembershipCharge = {
  id: number;
  periodStart: string;
  periodEnd: string;
  amountCents: number;
  status: MembershipChargeStatus;
  note?: string | null;
  FK_invoiceId: number | null;
};

export type Membership = {
  id: number;
  status: MembershipStatus;
  startedAt: string | null;
  endedAt: string | null;
  suspendedAt: string | null;
  endedReason: string | null;
  joinFeeCents: number | null;
  joinFeeLabel: string | null;
  FK_joinFeeInvoiceId: number | null;
  joinFeeStatus: "none" | "owed" | "invoiced";
  duesCents: number | null;
  duesLabel: string | null;
  duesInterval: DuesInterval;
  duesDayOfMonth: number | null;
  duesDueInDays: number | null;
  nextDueAt: string | null;
  autoBillDues: boolean;
  agreementOnFileAt: string | null;
  FK_agreementDocumentId: number | null;
  notes: string | null;
  createdAt: string;
  FK_orgUserId: number;
  FK_planId: number;
  plan: { id: number; name: string; archivedAt: string | null; FK_agreementDocumentTypeId: number | null };
  orgUser?: { id: number; identifier: string | null; user?: { id: number; name: string | null; email: string | null } | null };
  /** Only on a single-membership read. */
  charges?: MembershipCharge[];
  /** What "bill now" would raise — the SAME period and amount the server will invoice,
   *  including a prorated part-period when one is outstanding. Null when nothing is owed. */
  nextPeriod?: {
    periodStart: string;
    periodEnd: string;
    amountCents: number;
    prorated: boolean;
    /** This period was billed before and Stripe refused it. Pressing bill retries it. */
    retry: boolean;
  } | null;
};

/** The narrower thing a member sees about themselves at /memberships/me. */
export type MyMembership = {
  id: number;
  status: MembershipStatus;
  planName: string;
  startedAt: string | null;
  endedAt: string | null;
  duesCents: number | null;
  duesInterval: DuesInterval;
  nextDueAt: string | null;
  autoBillDues: boolean;
  joinFeeCents: number | null;
  joinFeeStatus: "none" | "owed" | "invoiced";
  joinFeeInvoiceId: number | null;
  agreementOnFileAt: string | null;
  /** The plan names a document type as its agreement. Nothing is gated on it. */
  agreementRequired: boolean;
  charges: MembershipCharge[];
};
