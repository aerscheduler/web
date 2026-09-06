import { api, apiList, ApiError } from "@/lib/api";
import type { PublicBookableSlot, PublicBookingPage } from "@/types/public-booking";

export function publicBookingPath(orgSlug: string, offeringSlug: string) {
  return `/public/book/${encodeURIComponent(orgSlug)}/offerings/${encodeURIComponent(offeringSlug)}`;
}

export function fetchPublicBookingPage(orgSlug: string, offeringSlug: string) {
  return api<PublicBookingPage>(publicBookingPath(orgSlug, offeringSlug), { anonymous: true });
}

export async function fetchPublicBookingSlots(
  orgSlug: string,
  offeringSlug: string,
  startDate: string,
  endDate: string
) {
  const path = `${publicBookingPath(orgSlug, offeringSlug)}/slots`;
  const all: PublicBookableSlot[] = [];
  let offset = 0;
  const limit = 1000;
  for (let page = 0; page < 20; page++) {
    const result = await apiList<PublicBookableSlot>(path, {
      query: { startDate, endDate, limit, offset },
      anonymous: true,
    });
    all.push(...result.data);
    if (!result.pagination.hasMore) {
      return {
        data: all,
        pagination: { ...result.pagination, total: all.length, offset: 0, returned: all.length, hasMore: false },
      };
    }
    offset += result.pagination.returned;
  }
  throw new ApiError(
    400,
    "Too many open times to show. Switch to week view, or narrow the date range."
  );
}

export function submitPublicBookingRequest(
  orgSlug: string,
  offeringSlug: string,
  body: {
    name: string;
    email: string;
    phone?: string;
    notes?: string;
    start: string;
    end: string;
    timeZoneName?: string;
    resourceId?: number | null;
    consent: boolean;
    website?: string;
  }
) {
  return api<{ submitted: boolean }>(`${publicBookingPath(orgSlug, offeringSlug)}/requests`, {
    method: "POST",
    body,
    anonymous: true,
  });
}

const confirmByToken = new Map<
  string,
  Promise<{ confirmed: boolean; alreadyConfirmed?: boolean }>
>();

export function confirmPublicBookingRequest(token: string) {
  const existing = confirmByToken.get(token);
  if (existing) return existing;
  const pending = api<{ confirmed: boolean; alreadyConfirmed?: boolean }>("/public/book/confirm", {
    method: "POST",
    body: { token },
    anonymous: true,
  }).catch((err) => {
    confirmByToken.delete(token);
    throw err;
  });
  confirmByToken.set(token, pending);
  return pending;
}
