// Types mirrored from the server Prisma schema (see insights/api-contract.md).
// All DateTime columns arrive as ISO strings; all money fields are integer cents.

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
  FK_organizationId?: number | null;
  orgUsers?: OrganizationUser[];
  organizations?: Organization[];
  details?: UserDetails;
}

export interface UserDetails {
  id: number;
  phone: string | null;
  address?: UserAddress;
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
  billing?: OrganizationBillingSettings;
  preferences?: OrganizationPreferences;
  details?: OrganizationDetails;
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
  private: boolean;
  newOrgOnboardingComplete: boolean;
  instructorsCanOverrideReservationPrices: boolean;
  personnelCanOnlyUseApprovedResources: boolean;
}

export interface OrganizationBillingSettings {
  id: number;
  enabled: boolean;
  defaultInstructorRate: number;
  serviceFeePercent: number | null;
  serviceFeeLabel: string;
  stripeEnabled: boolean;
}

export interface RoleRow {
  id: number;
  FK_orgUserId: number;
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

export interface OrganizationUser {
  id: number;
  createdAt: string;
  identifier: string | null;
  grounded: boolean;
  profileImage: string | null;
  FK_userId: number;
  FK_organizationId: number;
  adminRole?: RoleRow | null;
  ownerRole?: RoleRow | null;
  instructorRole?: InstructorRoleRow | null;
  studentRole?: StudentRoleRow | null;
  renterRole?: RoleRow | null;
  dispatcherRole?: RoleRow | null;
  technicianRole?: RoleRow | null;
  user?: User;
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
  | "sim"
  | "rental"
  | "guest"
  | "maintenance";

export interface Reservation {
  id: number;
  createdAt: string;
  cancelledAt: string | null;
  title: string;
  type: ReservationType;
  start: string;
  end: string;
  timeZoneName: string;
  notes: string | null;
  FK_organizationId: number;
  FK_resourceId: number | null;
  personnel?: ReservationPersonnel;
  resource?: Resource;
  invoice?: Invoice;
  /** Ramp/close-out readings + sign-offs. Present on the retrieve include set. */
  review?: ReservationReview | null;
  /**
   * The staff member who closed out a guest reservation (guests never confirm with a PIN —
   * an admin, the instructor, or the creator reviews it via `confirmReviewGuest`). Non-null
   * ⇒ the guest reservation has been reviewed and its invoice generated.
   */
  completedByForGuest?: { id: number } | null;
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
  /** One row per pilot who has signed off; length === personnel count ⇒ fully reviewed. */
  reviewConfirmations?: ReservationReviewConfirmation[];
}

export interface ReservationReviewConfirmation {
  id: number;
  FK_reviewedByOrgUserId?: number | null;
  reviewedBy?: OrganizationUser;
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
  FK_locationId: number;
  FK_organizationId: number;
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
  FK_organizationId: number;
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
  FK_reservationId: number | null;
  FK_customerOrgUserId: number | null;
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

export interface CurrencyType {
  id: number;
  name: string;
  description?: string | null;
  gracePeriodDays?: number | null;
  active?: boolean;
}

export interface Announcement {
  id: number;
  title: string;
  message: string;
  createdAt: string;
  expireAt: string | null;
  forRoles?: Role[] | null;
}

export interface Currency {
  id: number;
  startedAt: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
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
  /** Where the notification points, e.g. "/announcements". Not yet used for navigation. */
  link?: string | null;
  body?: string | null;
  message?: string | null;
  type?: string | null;
}

export interface Squawk {
  id: number;
  createdAt: string;
  resolvedAt: string | null;
  verifiedAt: string | null;
  title: string | null;
  description: string | null;
  grounding?: boolean;
  FK_resourceId: number | null;
  resource?: Resource;
  reportedBy?: OrganizationUser;
}

export interface MaintenanceReminder {
  id: number;
  createdAt: string;
  resolvedAt: string | null;
  dueAt: string | null;
  name: string | null;
  description: string | null;
  FK_resourceId: number | null;
  resource?: Resource;
}

// ---- Mutation input payloads (see insights/api-contract.md §4) ----

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
 * is optional instruction time (decimal hours). `comments[0]` is appended to the review.
 */
export interface RampInInput {
  hobbsTimeIn: number;
  tachTimeIn: number;
  briefing?: number;
  comments?: string[];
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
  customer?: { id: number };
  FK_customerOrgUserId?: number;
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
