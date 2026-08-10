import { expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";

type AuthBundle = {
  token: string;
  headers: { Authorization: string };
  orgUserId: number;
};

/** Login and return bearer headers + the caller's org-user id. */
export async function authAs(
  request: APIRequestContext,
  email: string,
): Promise<AuthBundle> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(res.ok(), `auth failed for ${email}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  const token = body.auth?.accessToken as string;
  const orgUsers = body.data?.user?.orgUsers ?? [];
  const orgUserId = orgUsers[0]?.id as number;
  expect(token).toBeTruthy();
  expect(orgUserId, `no orgUser for ${email}`).toBeTruthy();
  return { token, headers: { Authorization: `Bearer ${token}` }, orgUserId };
}

export function apiBase(): string {
  return apiProxyTarget().replace(/\/$/, "");
}

/** Denver wall-clock slot a few days out (inside flying day, past offer lead time). */
export function futureDenverSlot(hoursFromNowDays = 3): {
  start: Date;
  end: Date;
  ymd: string;
} {
  const probe = new Date(Date.now() + hoursFromNowDays * 864e5);
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(probe);
  const start = new Date(`${ymd}T10:00:00-06:00`);
  const end = new Date(start.getTime() + 3600_000);
  return { start, end, ymd };
}

/** First free ≥1h window on the resource, starting at least 2 days out. */
export async function findFreeHourSlot(
  request: APIRequestContext,
  headers: Record<string, string>,
  resourceId: number,
): Promise<{ start: Date; end: Date }> {
  const base = apiBase();
  const rangeStart = new Date(Date.now() + 2 * 864e5);
  const rangeEnd = new Date(Date.now() + 21 * 864e5);
  const res = await request.get(
    `${base}/availability/resource/${resourceId}?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}`,
    { headers },
  );
  expect(res.ok(), await res.text()).toBeTruthy();
  const body = await res.json();
  const windows = Array.isArray(body) ? body : (body.data ?? []);
  const needMs = 3600_000;
  for (const w of windows) {
    const start = new Date(w.start);
    const end = new Date(w.end);
    if (end.getTime() - start.getTime() < needMs) continue;
    if (start.getTime() < rangeStart.getTime()) {
      const shifted = new Date(rangeStart);
      if (end.getTime() - shifted.getTime() < needMs) continue;
      return { start: shifted, end: new Date(shifted.getTime() + needMs) };
    }
    return { start, end: new Date(start.getTime() + needMs) };
  }
  throw new Error(`No free 1h window on resource ${resourceId} in the next 21 days`);
}

export async function findBookablePlane(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const base = apiBase();
  const res = await request.get(`${base}/resources`, { headers });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  let plane: any = null;
  for (const r of items) {
    if (!r?.type?.plane || r.type.plane.grounded) continue;
    if (r.type.plane.tailNumber === "N172TS") {
      plane = r;
      break;
    }
    if (!plane) plane = r;
  }
  expect(plane, "need a bookable plane").toBeTruthy();
  return plane;
}

export async function orgUserIdForEmail(
  request: APIRequestContext,
  headers: Record<string, string>,
  email: string,
): Promise<number> {
  const base = apiBase();
  const res = await request.get(`${base}/orgUsers`, { headers });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const users = Array.isArray(body) ? body : (body.data ?? []);
  const hit = users.find((u: any) => u?.user?.email === email);
  expect(hit, `org user for ${email}`).toBeTruthy();
  return hit.id as number;
}

/**
 * Make cancel recovery deterministic for E2E: offers on, quiet hours off
 * (start === end), pending cap high. Returns prior settings to restore later.
 */
export async function ensureOfferPolicyForE2e(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const base = apiBase();
  const me = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  const login = await me.json();
  const prior = (login.data?.organization?.slotOfferSettings ?? {}) as Record<
    string,
    unknown
  >;
  const patch = await request.patch(`${base}/organizations`, {
    headers,
    data: {
      slotOfferSettings: {
        enabled: true,
        quietHoursStartMinute: 0,
        quietHoursEndMinute: 0,
        maxPendingOffers: 20,
        declineCooldownHours: 0,
      },
    },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();
  return prior;
}

export async function restoreOfferPolicy(
  request: APIRequestContext,
  headers: Record<string, string>,
  prior: Record<string, unknown>,
) {
  const base = apiBase();
  await request.patch(`${base}/organizations`, {
    headers,
    data: {
      slotOfferSettings: {
        enabled: prior.enabled !== false,
        quietHoursStartMinute: prior.quietHoursStartMinute ?? 1260,
        quietHoursEndMinute: prior.quietHoursEndMinute ?? 420,
        maxPendingOffers: prior.maxPendingOffers ?? 10,
        declineCooldownHours: prior.declineCooldownHours ?? 48,
      },
    },
  });
}

export async function withdrawPendingOffers(
  request: APIRequestContext,
  headers: Record<string, string>,
  notesMarker?: string,
) {
  const base = apiBase();
  const list = await request.get(`${base}/slot-offers`, { headers });
  if (!list.ok()) return 0;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  let n = 0;
  for (const offer of items) {
    if (offer.status !== "pending") continue;
    const title = offer.title ?? "";
    if (notesMarker && !String(title).includes(notesMarker) && !String(title).startsWith("E2E")) {
      continue;
    }
    if (!notesMarker && !String(title).startsWith("E2E")) continue;
    const w = await request.post(`${base}/slot-offers/${offer.id}/withdraw`, {
      headers,
    });
    if (w.ok()) n += 1;
  }
  return n;
}
