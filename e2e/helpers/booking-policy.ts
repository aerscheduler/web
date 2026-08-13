import { expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";
import { apiBase, authAs } from "./slot-offers";

export type BookingPolicySnapshot = {
  maxFutureBookings: number | null;
  maxReservationMinutes: number | null;
  cancelEditLockHours: number | null;
  lateCancelFeeCents: number | null;
  minimumBalanceCents: number | null;
  balanceMaximumCents: number | null;
  requirePaymentMethod: boolean;
};

/** Read bookingPolicy from a fresh owner login (auth payload carries the org). */
export async function readBookingPolicy(
  request: APIRequestContext,
): Promise<BookingPolicySnapshot> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const policy = (body.data?.organization?.bookingPolicy ?? {}) as Record<
    string,
    unknown
  >;
  return {
    maxFutureBookings:
      typeof policy.maxFutureBookings === "number" ? policy.maxFutureBookings : null,
    maxReservationMinutes:
      typeof policy.maxReservationMinutes === "number"
        ? policy.maxReservationMinutes
        : null,
    cancelEditLockHours:
      typeof policy.cancelEditLockHours === "number" ? policy.cancelEditLockHours : null,
    lateCancelFeeCents:
      typeof policy.lateCancelFeeCents === "number" ? policy.lateCancelFeeCents : null,
    minimumBalanceCents:
      typeof policy.minimumBalanceCents === "number" ? policy.minimumBalanceCents : null,
    balanceMaximumCents:
      typeof policy.balanceMaximumCents === "number" ? policy.balanceMaximumCents : null,
    requirePaymentMethod: policy.requirePaymentMethod === true,
  };
}

export async function setMaxFutureBookings(
  request: APIRequestContext,
  headers: Record<string, string>,
  maxFutureBookings: number | null,
): Promise<BookingPolicySnapshot> {
  const prior = await readBookingPolicy(request);
  const patch = await request.patch(`${apiBase()}/organizations`, {
    headers,
    data: { bookingPolicy: { maxFutureBookings } },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  return prior;
}

export async function restoreBookingPolicy(
  request: APIRequestContext,
  headers: Record<string, string>,
  prior: BookingPolicySnapshot,
) {
  await request.patch(`${apiBase()}/organizations`, {
    headers,
    data: {
      bookingPolicy: {
        maxFutureBookings: prior.maxFutureBookings,
        maxReservationMinutes: prior.maxReservationMinutes,
        cancelEditLockHours: prior.cancelEditLockHours,
        lateCancelFeeCents: prior.lateCancelFeeCents,
        minimumBalanceCents: prior.minimumBalanceCents,
        balanceMaximumCents: prior.balanceMaximumCents,
        requirePaymentMethod: prior.requirePaymentMethod,
      },
    },
  });
}

/** Upcoming (not ended, not cancelled, not maintenance) bookings seating this org-user. */
export async function countUpcomingForMember(
  request: APIRequestContext,
  headers: Record<string, string>,
  orgUserId: number,
): Promise<number> {
  const base = apiBase();
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 400 * 864e5).toISOString();
  const list = await request.get(
    `${base}/reservations?startDate=${start}&endDate=${end}&includeCanceled=false`,
    { headers },
  );
  expect(list.ok()).toBeTruthy();
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  const now = Date.now();
  let n = 0;
  for (const r of items) {
    if (r?.cancelledAt) continue;
    if (r?.type === "maintenance") continue;
    if (new Date(r.end).getTime() <= now) continue;
    const students = r.personnel?.students ?? [];
    const renters = r.personnel?.renters ?? [];
    if ([...students, ...renters].some((p: { id?: number }) => p?.id === orgUserId)) {
      n += 1;
    }
  }
  return n;
}

export function denverWeekday(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
  }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

export function denverYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function denverHm(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Denver",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "10";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** POST a weekly repeating rental; returns status + body (does not throw on 4xx). */
export async function postWeeklySeries(
  request: APIRequestContext,
  headers: Record<string, string>,
  args: {
    resourceId: number;
    renterId: number;
    start: Date;
    end: Date;
    count: number;
    notes: string;
  },
) {
  const base = apiBase();
  const res = await request.post(`${base}/reservations/`, {
    headers,
    data: {
      title: "E2E Recurring Cap",
      type: "rental",
      start: args.start.toISOString(),
      end: args.end.toISOString(),
      timeZoneName: "America/Denver",
      notes: args.notes,
      resource: { id: args.resourceId },
      personnel: { renters: [{ id: args.renterId }] },
      recurrence: {
        frequency: "weekly",
        interval: 1,
        daysOfWeek: [denverWeekday(args.start)],
        startTime: denverHm(args.start),
        durationMins: Math.round(
          (args.end.getTime() - args.start.getTime()) / 60_000,
        ),
        timeZoneName: "America/Denver",
        startDate: denverYmd(args.start),
        until: null,
        count: args.count,
      },
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: res.status(), body };
}

export async function ownerAuth(request: APIRequestContext) {
  return authAs(request, ACCOUNTS.owner);
}
