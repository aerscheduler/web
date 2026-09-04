import { expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";

export type OrgBookingSnapshot = {
  approvalRoles: string[];
  minimumBalanceCents: number | null;
  balanceMaximumCents: number | null;
  dispatchMinimumBalanceCents: number | null;
  dispatchBalanceMaximumCents: number | null;
  ledgerEnabled: boolean;
};

export async function ownerAuthToken(request: APIRequestContext): Promise<string> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email: ACCOUNTS.owner, password: TEST_PASSWORD },
  });
  expect(auth.ok()).toBeTruthy();
  return (await auth.json()).auth.accessToken as string;
}

export async function authToken(
  request: APIRequestContext,
  email: string
): Promise<string> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok(), `auth failed for ${email}`).toBeTruthy();
  return (await auth.json()).auth.accessToken as string;
}

export async function orgUserIdForEmail(
  request: APIRequestContext,
  ownerToken: string,
  email: string
): Promise<number> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.get(`${base}/orgUsers`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  const row = items.find(
    (u: { user?: { email?: string } }) => u.user?.email?.toLowerCase() === email.toLowerCase()
  );
  expect(row?.id, `org user not found for ${email}`).toBeTruthy();
  return row.id as number;
}

export async function readOrgBookingSnapshot(
  request: APIRequestContext,
  ownerToken: string
): Promise<OrgBookingSnapshot> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${ownerToken}` };
  const [orgRes, ledgerRes] = await Promise.all([
    request.get(`${base}/organizations/`, { headers }),
    request.get(`${base}/organizations/ledger`, { headers }),
  ]);
  expect(orgRes.ok()).toBeTruthy();
  expect(ledgerRes.ok()).toBeTruthy();
  const orgBody = await orgRes.json();
  const org = Array.isArray(orgBody.data) ? orgBody.data[0] : orgBody.data ?? orgBody;
  const ledgerBody = await ledgerRes.json();
  const ledger = ledgerBody.data ?? ledgerBody;
  const policy = org.bookingPolicy ?? {};
  return {
    approvalRoles: policy.bookingApprovalRequiredRoles ?? [],
    minimumBalanceCents: policy.minimumBalanceCents ?? null,
    balanceMaximumCents: policy.balanceMaximumCents ?? null,
    dispatchMinimumBalanceCents: policy.dispatchMinimumBalanceCents ?? null,
    dispatchBalanceMaximumCents: policy.dispatchBalanceMaximumCents ?? null,
    ledgerEnabled: ledger.enabled === true,
  };
}

export async function patchBookingPolicy(
  request: APIRequestContext,
  ownerToken: string,
  bookingPolicy: Record<string, unknown>
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.patch(`${base}/organizations/`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { bookingPolicy },
  });
  expect(res.ok(), `PATCH bookingPolicy failed: ${await res.text()}`).toBeTruthy();
}

export async function patchLedger(
  request: APIRequestContext,
  ownerToken: string,
  enabled: boolean
) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.patch(`${base}/organizations/ledger`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { enabled },
  });
  expect(res.ok(), `PATCH ledger failed: ${await res.text()}`).toBeTruthy();
}

export async function getLedgerBalance(
  request: APIRequestContext,
  ownerToken: string,
  orgUserId: number
): Promise<number> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.get(`${base}/orgUsers/${orgUserId}/ledger`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(res.ok(), `ledger read failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return (body.data?.balanceCents ?? body.balanceCents) as number;
}

export async function postLedgerAdjustment(
  request: APIRequestContext,
  ownerToken: string,
  orgUserId: number,
  amountCents: number,
  memo: string
) {
  expect(amountCents, "ledger adjustment must be non-zero").not.toBe(0);
  const base = apiProxyTarget().replace(/\/$/, "");
  const res = await request.post(`${base}/orgUsers/${orgUserId}/ledger/entries`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { amountCents, type: "adjustment", memo },
  });
  expect(res.ok(), `ledger adjustment failed: ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  return body.data?.balanceCents as number;
}

/** Desk adjustment to an exact balance (posts the delta from current). */
export async function setLedgerBalance(
  request: APIRequestContext,
  ownerToken: string,
  orgUserId: number,
  targetCents: number,
  memo: string
) {
  const current = await getLedgerBalance(request, ownerToken, orgUserId);
  const delta = targetCents - current;
  if (delta === 0) return current;
  return postLedgerAdjustment(request, ownerToken, orgUserId, delta, memo);
}

export async function restoreOrgBookingSnapshot(
  request: APIRequestContext,
  ownerToken: string,
  snap: OrgBookingSnapshot
) {
  await patchLedger(request, ownerToken, snap.ledgerEnabled);
  await patchBookingPolicy(request, ownerToken, {
    bookingApprovalRequiredRoles: snap.approvalRoles,
    minimumBalanceCents: snap.minimumBalanceCents,
    balanceMaximumCents: snap.balanceMaximumCents,
    dispatchMinimumBalanceCents: snap.dispatchMinimumBalanceCents,
    dispatchBalanceMaximumCents: snap.dispatchBalanceMaximumCents,
  });
}

export async function cancelPendingBookingRequests(request: APIRequestContext) {
  const base = apiProxyTarget().replace(/\/$/, "");
  const ownerToken = await ownerAuthToken(request);
  const headers = { Authorization: `Bearer ${ownerToken}` };
  const list = await request.get(`${base}/booking-requests`, { headers });
  if (!list.ok()) return;
  const body = await list.json();
  const items = Array.isArray(body) ? body : (body.data ?? []);
  for (const row of items) {
    if (row.status !== "pending") continue;
    await request.post(`${base}/booking-requests/${row.id}/reject`, {
      headers,
      data: { reason: "E2E cleanup" },
    });
  }
}
