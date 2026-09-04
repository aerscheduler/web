import { expect, type APIRequestContext } from "@playwright/test";
import { ACCOUNTS, TEST_PASSWORD, apiProxyTarget } from "./env";

/** Fail fast when AERTEST01 is paywalled. Booking E2E cannot run behind the gate. */
export async function assertTestOrgEntitled(
  request: APIRequestContext,
  email = ACCOUNTS.owner,
): Promise<void> {
  const base = apiProxyTarget().replace(/\/$/, "");
  const auth = await request.post(`${base}/auth/`, {
    data: { email, password: TEST_PASSWORD },
  });
  expect(auth.ok(), `auth failed for ${email}`).toBeTruthy();
  const token = (await auth.json()).auth.accessToken as string;
  const sub = await request.get(`${base}/subscription`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(sub.ok(), await sub.text()).toBeTruthy();
  const body = await sub.json();
  const status = (body.data ?? body) as { blocked?: boolean; state?: string };
  expect(status.blocked).toBeFalsy();
}
