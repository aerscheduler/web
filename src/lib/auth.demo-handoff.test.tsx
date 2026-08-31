// @vitest-environment jsdom
/**
 * The demo → real sign-in handoff.
 *
 * A visitor tries the demo and then signs up or signs in FROM THAT SAME TAB, which is
 * the path the demo is built to produce. `isDemoTab()` is derived from the presence of
 * a demo token in sessionStorage, and both `setToken` and `saveSession` branch on it,
 * so unless the sign-in clears the demo first, the new account's token and session are
 * written to the DEMO keys. That is not cosmetic: the real session then lives in
 * per-tab storage, so closing the tab signs a brand-new customer out of the account
 * they just made, `logout()` takes the demo branch, and every analytics event the tab
 * sends is tagged `is_demo: true`.
 *
 * Seen in production: a school that signed up straight out of the demo had all 304 of
 * its first-session events tagged as demo traffic.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const beacons: number[] = [];

vi.mock("./api", () => ({
  apiRaw: vi.fn(),
  getToken: () => {
    const demo = window.sessionStorage.getItem("aer.demo.token");
    return demo ?? window.localStorage.getItem("aer.token");
  },
  setToken: (token: string | null) => {
    // Mirrors the real setToken: a demo tab writes to the demo key.
    const demoTab = window.sessionStorage.getItem("aer.demo.token") != null;
    if (demoTab) {
      if (token) window.sessionStorage.setItem("aer.demo.token", token);
      else window.sessionStorage.removeItem("aer.demo.token");
      return;
    }
    if (token) window.localStorage.setItem("aer.token", token);
    else window.localStorage.removeItem("aer.token");
  },
  isTokenExpired: () => false,
  beaconDemoExit: () => beacons.push(1),
}));

const identified: Array<Record<string, unknown>> = [];
vi.mock("./analytics", () => ({
  identify: (_id: unknown, props: Record<string, unknown>) => identified.push(props),
  resetIdentity: () => {},
}));
vi.mock("./google", () => ({ signInWithGoogle: vi.fn() }));
vi.mock("./apple", () => ({ signInWithApple: vi.fn() }));
vi.mock("sonner", () => ({ toast: { dismiss: () => {}, error: () => {}, success: () => {} } }));

const { AuthProvider, useAuth } = await import("./auth");
const { isDemoTab } = await import("./demo");
const api = await import("./api");

const ENVELOPE = {
  auth: { accessToken: "real-token" },
  data: {
    user: { id: 4242, email: "owner@example.com", name: "Real Owner" },
    organization: { id: 77, name: "Real Flight School" },
    organizations: [{ id: 77, name: "Real Flight School" }],
  },
};

let auth: ReturnType<typeof useAuth>;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

function Probe() {
  auth = useAuth();
  return null;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  beacons.length = 0;
  identified.length = 0;
  vi.mocked(api.apiRaw).mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** Put this tab in the demo, the way applyDemo does. */
async function enterDemo() {
  vi.mocked(api.apiRaw).mockResolvedValueOnce({
    auth: { accessToken: "demo-token" },
    data: {
      user: { id: 1, email: "fieldstone-owner@demo.aerscheduler.invalid", name: "Marisol" },
      organization: { id: 552, name: "Fieldstone Aviation" },
      organizations: [{ id: 552, name: "Fieldstone Aviation" }],
    },
    demo: { orgId: 552, orgUserId: 1, expiresInSeconds: 900, identities: [] },
  } as never);
  await act(async () => {
    await auth.startDemo();
  });
}

describe("signing in from a demo tab", () => {
  it("puts the tab in the demo first, as the fixture for the rest", async () => {
    await enterDemo();
    expect(isDemoTab()).toBe(true);
    expect(window.sessionStorage.getItem("aer.demo.session")).toBeTruthy();
    // The demo must never touch the real keys.
    expect(window.localStorage.getItem("aer.token")).toBeNull();
  });

  it("registering leaves demo mode, so the account lands in localStorage", async () => {
    await enterDemo();
    vi.mocked(api.apiRaw).mockResolvedValueOnce(ENVELOPE as never);
    await act(async () => {
      await auth.register("Real Owner", "owner@example.com", "pw");
    });

    // The tab is no longer a demo tab: this is what `is_demo` is derived from.
    expect(isDemoTab()).toBe(false);
    expect(window.sessionStorage.getItem("aer.demo.token")).toBeNull();
    expect(window.sessionStorage.getItem("aer.demo.session")).toBeNull();
    expect(window.sessionStorage.getItem("aer.demo.meta")).toBeNull();

    // ...and the new account is in DURABLE storage, so closing the tab does not
    // sign the customer out of the account they just created.
    expect(window.localStorage.getItem("aer.token")).toBe("real-token");
    const stored = JSON.parse(window.localStorage.getItem("aer.session") ?? "{}");
    expect(stored.user.id).toBe(4242);
    expect(stored.organization.id).toBe(77);
  });

  it("logging in does the same, and hands the sandbox back to the pool", async () => {
    await enterDemo();
    vi.mocked(api.apiRaw).mockResolvedValueOnce(ENVELOPE as never);
    await act(async () => {
      await auth.login("owner@example.com", "pw");
    });

    expect(isDemoTab()).toBe(false);
    expect(window.localStorage.getItem("aer.token")).toBe("real-token");
    // Told the server rather than waiting for the lease to lapse; the pool is small.
    expect(beacons).toHaveLength(1);
  });

  it("still reports the real person and org to analytics, not the demo one", async () => {
    await enterDemo();
    vi.mocked(api.apiRaw).mockResolvedValueOnce(ENVELOPE as never);
    await act(async () => {
      await auth.register("Real Owner", "owner@example.com", "pw");
    });
    expect(identified.at(-1)?.email).toBe("owner@example.com");
  });

  it("entering the demo does NOT clear it (applyDemo opts out of the handoff)", async () => {
    await enterDemo();
    // The demo writes its token, then calls the same apply(); if the handoff did not
    // opt out, the demo would immediately clear itself and hit the pool every time.
    expect(isDemoTab()).toBe(true);
    expect(beacons).toHaveLength(0);
  });
});
