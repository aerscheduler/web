/**
 * The public demo sandbox, client side.
 *
 * WHERE THE DEMO SESSION LIVES, AND WHY IT IS NOT localStorage
 *
 * A real session lives in localStorage under `aer.token` / `aer.session`. If the
 * demo used those, a customer who clicked "Try the demo" from the marketing site
 * while signed in to their own account in another tab would have their real
 * session overwritten — localStorage is shared across every tab on the origin.
 * That is a bad way to introduce someone to the product.
 *
 * A flag saying "this browser is in demo mode" does not fix it either, for the
 * same reason: the flag would be shared too, and the customer's other tab would
 * start reading the demo token.
 *
 * So the demo session lives in **sessionStorage**, which is per-tab. The demo tab
 * reads demo keys; every other tab is untouched and keeps its real session. Two
 * things fall out of that for free:
 *
 *   - closing the tab ends the demo, with no cleanup and nothing left behind on a
 *     shared machine;
 *   - `SessionWatcher`'s cross-tab `storage` listener only fires for localStorage,
 *     so a demo can never sign a real session out of another tab.
 *
 * The reads have to be synchronous because the router's `beforeLoad` guards run
 * before React renders. sessionStorage is synchronous, so that works out.
 */

const DEMO_TOKEN_KEY = "aer.demo.token";
const DEMO_SESSION_KEY = "aer.demo.session";

/** Safe accessor: sessionStorage throws in some privacy modes. */
function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * True when THIS TAB is a demo tab.
 *
 * Derived from the presence of a demo token rather than a separate flag, so the
 * two can never disagree — there is no state where the tab thinks it is in demo
 * mode but has nothing to authenticate with.
 */
export function isDemoTab(): boolean {
  return store()?.getItem(DEMO_TOKEN_KEY) != null;
}

export function getDemoToken(): string | null {
  return store()?.getItem(DEMO_TOKEN_KEY) ?? null;
}

export function setDemoToken(token: string | null) {
  const s = store();
  if (!s) return;
  if (token) s.setItem(DEMO_TOKEN_KEY, token);
  else s.removeItem(DEMO_TOKEN_KEY);
}

export function getDemoSessionRaw(): string | null {
  return store()?.getItem(DEMO_SESSION_KEY) ?? null;
}

export function setDemoSessionRaw(json: string | null) {
  const s = store();
  if (!s) return;
  if (json) s.setItem(DEMO_SESSION_KEY, json);
  else s.removeItem(DEMO_SESSION_KEY);
}

export function clearDemo() {
  setDemoToken(null);
  setDemoSessionRaw(null);
  setDemoMeta(null);
}

/** One person a visitor can become, as returned by the server. */
export interface DemoIdentity {
  orgUserId: number;
  name: string;
  roles: string[];
}

/** The `demo` block that rides alongside the auth envelope. */
export interface DemoMeta {
  orgId: number;
  orgUserId: number;
  expiresInSeconds: number;
  identities: DemoIdentity[];
}

const DEMO_META_KEY = "aer.demo.meta";

export function getDemoMeta(): DemoMeta | null {
  try {
    const raw = store()?.getItem(DEMO_META_KEY);
    return raw ? (JSON.parse(raw) as DemoMeta) : null;
  } catch {
    return null;
  }
}

export function setDemoMeta(meta: DemoMeta | null) {
  const s = store();
  if (!s) return;
  if (meta) s.setItem(DEMO_META_KEY, JSON.stringify(meta));
  else s.removeItem(DEMO_META_KEY);
}

/**
 * Read the `demoOrgId` claim the server stamps on a demo token.
 *
 * Decoded without verifying, exactly as `decodeImpersonatedBy` does and for the
 * same reason: this drives a banner, and the server re-verifies the signature on
 * every request. Reading it from the TOKEN rather than from React state means the
 * banner survives a refresh — which matters, because the banner is the only thing
 * telling the visitor that nothing they are looking at is real.
 */
export function decodeDemoOrgId(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { demoOrgId?: unknown };
    return typeof claims.demoOrgId === "number" ? claims.demoOrgId : null;
  } catch {
    return null;
  }
}

/** A role name the switcher can show, title-cased for display. */
export function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
