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

export interface OrganizationPreferences {
  id: number;
  private: boolean;
  newOrgOnboardingComplete: boolean;
  instructorsCanOverrideReservationPrices: boolean;
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
  instructorRole?: RoleRow | null;
  studentRole?: RoleRow | null;
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
}

export interface ReservationPersonnel {
  id: number;
  instructors?: OrganizationUser[];
  students?: OrganizationUser[];
  renters?: OrganizationUser[];
  guests?: Guest[];
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

/** Convenience: resolve a resource's display name + kind. */
export function resourceLabel(r: Resource): { name: string; kind: "Aircraft" | "Simulator" | "Room" | "Resource" } {
  const t = r.type;
  if (t?.plane) return { name: t.plane.tailNumber, kind: "Aircraft" };
  if (t?.simulator) return { name: t.simulator.name, kind: "Simulator" };
  if (t?.room) return { name: `Room ${t.room.roomNumber}`, kind: "Room" };
  return { name: `Resource #${r.id}`, kind: "Resource" };
}
