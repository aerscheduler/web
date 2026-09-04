import type { Resource } from "@/types/api";

export type BookingRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired";

export interface BookingRequest {
  id: number;
  createdAt: string;
  updatedAt: string;
  status: BookingRequestStatus;
  source: "internal" | "public_embed";
  title?: string | null;
  reservationType: string;
  start: string;
  end: string;
  timeZoneName: string;
  notes?: string | null;
  personnel?: Record<string, unknown> | null;
  decidedAt?: string | null;
  decisionReason?: string | null;
  requestedBy?: {
    id: number;
    user?: { id: number; name?: string; email?: string };
  };
  decidedBy?: {
    id: number;
    user?: { id: number; name?: string };
  } | null;
  resource?: Resource | null;
  instructorOrgUser?: {
    id: number;
    user?: { id: number; name?: string };
  } | null;
  location?: { id: number; name?: string; timeZone?: string | null } | null;
  resultingReservation?: { id: number; start?: string; end?: string; type?: string } | null;
}

export type CreateBookingRequestInput = {
  start: string;
  end: string;
  type: string;
  title?: string | null;
  timeZoneName?: string | null;
  notes?: string | null;
  resource?: { id: number } | null;
  location?: { id: number } | null;
  rating?: { id: number } | null;
  personnel?: Record<string, unknown>;
};

export type ApproveBookingRequestInput = {
  resource?: { id: number } | null;
  location?: { id: number } | null;
  instructorOrgUserId?: number | null;
  personnel?: Record<string, unknown>;
  title?: string | null;
};
