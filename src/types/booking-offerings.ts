import type { Location, Resource } from "@/types/api";

export const CALENDAR_DETAIL_LEVELS = [
  "slots_only",
  "blocked_anonymous",
  "own_bookings_named",
  "full",
] as const;

export type CalendarDetailLevel = (typeof CALENDAR_DETAIL_LEVELS)[number];

export type OrganizationCalendarVisibility = {
  guestLevel: CalendarDetailLevel;
  studentLevel: CalendarDetailLevel;
  renterLevel: CalendarDetailLevel;
  instructorLevel: CalendarDetailLevel;
  memberLevel: CalendarDetailLevel;
};

export type BookingOfferingAssignmentMode = "desk_assigns" | "member_picks_resource";

export type BookingOfferingReservationType =
  | "guest"
  | "solo"
  | "dual"
  | "rental"
  | "ground"
  | "sim";

export interface BookingOffering {
  id: number;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  slug: string;
  name: string;
  description?: string | null;
  reservationType: BookingOfferingReservationType;
  assignmentMode: BookingOfferingAssignmentMode;
  minimumNoticeMinutes?: number | null;
  bookingHorizonDays?: number | null;
  fixedReservationMinutes?: number | null;
  bufferBeforeMinutes?: number | null;
  bufferAfterMinutes?: number | null;
  maxReservationMinutes?: number | null;
  allowResourceChoice: boolean;
  allowInstructorChoice: boolean;
  allowLocationChoice: boolean;
  questions?: Record<string, unknown> | null;
  location?: Pick<Location, "id" | "name" | "timeZone"> | null;
  resources?: { resource?: Resource | null }[];
  instructors?: {
    instructorOrgUser?: {
      id: number;
      user?: { id: number; name?: string | null };
    } | null;
  }[];
}

export type BookingOfferingInput = {
  active?: boolean;
  slug?: string;
  name?: string;
  description?: string | null;
  reservationType?: BookingOfferingReservationType;
  assignmentMode?: BookingOfferingAssignmentMode;
  minimumNoticeMinutes?: number | null;
  bookingHorizonDays?: number | null;
  fixedReservationMinutes?: number | null;
  bufferBeforeMinutes?: number | null;
  bufferAfterMinutes?: number | null;
  maxReservationMinutes?: number | null;
  allowResourceChoice?: boolean;
  allowInstructorChoice?: boolean;
  allowLocationChoice?: boolean;
  locationId?: number | null;
  resourceIds?: number[];
  instructorOrgUserIds?: number[];
};

export type BookableSlot = {
  start: string;
  end: string;
  timeZone: string;
  resourceId?: number | null;
  resourceLabel?: string | null;
};
