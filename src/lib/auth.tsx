import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { apiRaw, beaconDemoExit, getToken, isTokenExpired, setToken } from "./api";
import { identify, resetIdentity } from "./analytics";
import { signInWithGoogle } from "./google";
import { signInWithApple } from "./apple";
import {
  clearDevStash,
  decodeImpersonatedBy,
  isDeveloperEmail,
  readDevStash,
  writeDevStash,
} from "./developer";
import {
  clearDemo,
  decodeDemoOrgId,
  getDemoMeta,
  getDemoSessionRaw,
  isDemoTab,
  setDemoMeta,
  setDemoSessionRaw,
  setDemoToken,
  type DemoMeta,
} from "./demo";
import { rolesOf, type Organization, type OrganizationUser, type Role, type User } from "@/types/api";

interface AuthEnvelope {
  auth: { accessToken: string };
  data: {
    user: User;
    organization?: Organization | null;
    organizations?: Organization[];
  };
}

interface SessionState {
  user: User | null;
  organization: Organization | null;
  organizations: Organization[];
}

const SESSION_KEY = "aer.session";

/**
 * A demo tab keeps its session in per-tab sessionStorage instead, so a visitor
 * trying the demo never overwrites their own signed-in session in another tab.
 * Same reasoning as the token split in lib/api.ts, see lib/demo.ts.
 */
function loadSession(): SessionState {
  try {
    const raw = isDemoTab() ? getDemoSessionRaw() : localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    /* ignore */
  }
  return { user: null, organization: null, organizations: [] };
}

function saveSession(s: SessionState) {
  if (isDemoTab()) {
    setDemoSessionRaw(JSON.stringify(s));
    return;
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

/** Read synchronously, used by the router guard before React renders.
 *
 *  A token whose own `exp` has passed counts as signed out: the server would
 *  reject it anyway, and catching it here means an expired tab goes to /login
 *  instead of rendering the app and failing on the first request. */
export function isAuthenticated(): boolean {
  const token = getToken();
  return Boolean(token) && !isTokenExpired(token);
}

/** The caller's roles in the active org, read synchronously from the stored
 * session, used by router guards before React renders. */
export function rolesFromSession(): Role[] {
  const s = loadSession();
  const ous = s.user?.orgUsers ?? [];
  // The server's /auth scopes `user.orgUsers` to the ACTIVE org (org switch does a
  // full reload), so the first (only) entry is the caller's active-org membership.
  // We can't match on FK_organizationId, the server strips every FK_* field.
  const membership = ous[0];
  return membership ? rolesOf(membership) : [];
}

/** Synchronous staff check from the stored session (owner/admin/dispatcher). */
export function isStaffSync(): boolean {
  return rolesFromSession().some((r) => r === "owner" || r === "admin" || r === "dispatcher");
}

/** Synchronous developer check from the stored session, for the /developer route
 *  guard. Cosmetic: the server enforces the same allowlist on every request. */
export function isDeveloperSync(): boolean {
  return isDeveloperEmail(loadSession().user?.email);
}

/** True if the stored session has an active organization. */
export function hasActiveOrg(): boolean {
  return loadSession().organization != null;
}

/** True if the signed-in user has verified their email. Read synchronously from
 *  the stored session for router guards, mirrors the Flutter app, which already
 *  blocks unverified users after signup. */
export function isEmailVerifiedSync(): boolean {
  return Boolean(loadSession().user?.emailVerifiedAt);
}

/** True when the current token was minted by `POST /developer/loginAs`. Read from
 *  the token itself so it survives a refresh. */
export function isImpersonatingSync(): boolean {
  return decodeImpersonatedBy(getToken()) !== null;
}

/** True when this tab is driving the public demo sandbox. Read from the token so
 *  it survives a refresh, and used by router guards before React renders. */
export function isDemoSync(): boolean {
  return decodeDemoOrgId(getToken()) !== null;
}

/** Whether the email-verification gate should apply. Bypassed on local dev
 *  (`npm run dev`) so onboarding is testable without a real verification link.
 *  the dev server talks to the prod API, which never auto-verifies. Enforced in
 *  every built (preview/prod) bundle.
 *
 *  Also bypassed while impersonating: /verify-email is a dead end for a developer
 *  (you cannot click a link sent to someone else's inbox), and troubleshooting an
 *  unverified account is exactly when you need to get in and look.
 *
 *  And bypassed in the demo, for the sharper version of the same reason: a demo
 *  account's address is at a reserved domain that can never receive mail, so
 *  /verify-email would be a wall with no door. The seed marks them verified, so
 *  this is belt and braces rather than the only thing holding it up. */
export function needsEmailVerification(): boolean {
  return !import.meta.env.DEV && !isEmailVerifiedSync() && !isImpersonatingSync() && !isDemoSync();
}

/** Where to send a user right after authenticating, based on the fresh session. */
export function postLoginPath(): "/verify-email" | "/onboarding" | "/dashboard" | "/me" {
  if (needsEmailVerification()) return "/verify-email";
  if (!hasActiveOrg()) return "/onboarding";
  return isStaffSync() ? "/dashboard" : "/me";
}

interface AuthContextValue extends SessionState {
  /** The caller's membership row (OrganizationUser) in the active org. */
  membership: OrganizationUser | null;
  /** The caller's roles in the active org. */
  roles: Role[];
  /** OrganizationUser.id in the active org (personnel/invoices id space). */
  orgUserId: number | null;
  /** User.id (person id space). */
  userId: number | null;
  /** True if the caller can manage the org (owner/admin/dispatcher). */
  isStaff: boolean;
  /**
   * True if the caller is an owner/admin. Narrower than `isStaff` on purpose: the server
   * gates admin-only document work on the `adminRole` relation, which dispatchers lack.
   */
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Sign in / sign up with Google (opens the Google account chooser). */
  googleLogin: () => Promise<void>;
  /** Sign in / sign up with Apple (opens the Apple popup). */
  appleLogin: () => Promise<void>;
  logout: () => void;
  switchOrg: (orgId: number) => Promise<void>;
  /** Create a new org (caller becomes owner+admin). Swaps the active token. */
  createOrganization: (input: Record<string, unknown>) => Promise<Organization>;
  /**
   * Join a school by its code. Returns "joined" (public/invited, token swapped to the new org)
   * or "requested" (private school, a join request was sent for an admin to approve).
   */
  joinByCode: (code: string) => Promise<"joined" | "requested">;
  /** Re-send the account verification email to the signed-in user. */
  resendVerificationEmail: () => Promise<void>;
  rehydrate: () => Promise<void>;
  /** True if this user's email is on the developer allowlist (UI gating only.
   *  the server independently enforces it on every /developer request). */
  isDeveloper: boolean;
  /** True if the active session came from "log in as" rather than a real login. */
  isImpersonating: boolean;
  /** While impersonating: the developer account to return to. */
  impersonatorEmail: string | null;
  /** Developer only: swap this session for `email`'s. Parks the developer session
   *  so `stopImpersonating()` can put it back. */
  loginAs: (email: string) => Promise<void>;
  /** Restore the parked developer session. Returns false if there wasn't one. */
  stopImpersonating: () => boolean;

  /** True if this tab is driving the public demo sandbox. */
  isDemo: boolean;
  /** The sandbox's roles, clock and ids, null outside a demo. */
  demo: DemoMeta | null;
  /** Start a demo in THIS TAB. Anything already signed in elsewhere is untouched. */
  startDemo: () => Promise<void>;
  /** Become a different role inside the same sandbox. */
  switchDemoRole: (orgUserId: number) => Promise<void>;
  /** Rebuild the sandbox and pick up a fresh session for it. */
  resetDemo: () => Promise<void>;
  /** Leave the demo, dropping every trace of it from this tab. */
  exitDemo: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** In-flight `POST /demo/session`, shared across every caller, see startDemo. */
let demoStartInFlight: Promise<AuthEnvelope & { demo: DemoMeta }> | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(() =>
    getToken() ? loadSession() : { user: null, organization: null, organizations: [] }
  );

  const apply = useCallback((env: AuthEnvelope) => {
    // Whatever was on screen belongs to the session that just ended, most of
    // all the "you've been signed out" toast, which is actively wrong now.
    toast.dismiss();
    setToken(env.auth.accessToken);
    const orgs =
      env.data.organizations ??
      (env.data.organization ? [env.data.organization] : []);
    const next: SessionState = {
      user: env.data.user,
      organization: env.data.organization ?? orgs[0] ?? null,
      organizations: orgs,
    };
    saveSession(next);
    setSession(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const env = await apiRaw<AuthEnvelope>("/auth", {
        method: "POST",
        body: { email, password },
      });
      apply(env);
    },
    [apply]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const env = await apiRaw<AuthEnvelope>("/users", {
        method: "POST",
        body: { name, email, password },
      });
      apply(env);
    },
    [apply]
  );

  const googleLogin = useCallback(async () => {
    const profile = await signInWithGoogle();
    const env = await apiRaw<AuthEnvelope>("/auth/google", {
      method: "POST",
      body: {
        accessToken: profile.accessToken,
        name: profile.name,
        profileImage: profile.profileImage,
      },
    });
    apply(env);
  }, [apply]);

  const appleLogin = useCallback(async () => {
    const profile = await signInWithApple();
    const env = await apiRaw<AuthEnvelope>("/auth/apple", {
      method: "POST",
      body: { authCode: profile.authCode, name: profile.name, web: true },
    });
    apply(env);
  }, [apply]);

  const switchOrg = useCallback(
    async (orgId: number) => {
      const env = await apiRaw<AuthEnvelope>(`/organizations/switch/${orgId}`, {
        method: "POST",
      });
      apply(env);
    },
    [apply]
  );

  const createOrganization = useCallback(
    async (input: Record<string, unknown>) => {
      const env = await apiRaw<AuthEnvelope>("/organizations/", {
        method: "POST",
        body: input,
      });
      apply(env);
      return env.data.organization as Organization;
    },
    [apply]
  );

  const joinByCode = useCallback(
    async (code: string): Promise<"joined" | "requested"> => {
      const res = await apiRaw<Partial<AuthEnvelope> & { message?: string }>(
        `/organizations/join/${encodeURIComponent(code.trim())}`,
        { method: "POST" }
      );
      // Public school / pending invite ⇒ we get a fresh token scoped to the org.
      if (res?.auth?.accessToken && res.data) {
        apply(res as AuthEnvelope);
        return "joined";
      }
      // Private school ⇒ 201 with just a message; an admin must approve.
      return "requested";
    },
    [apply]
  );

  const resendVerificationEmail = useCallback(async () => {
    await apiRaw("/auth/resendVerificationEmail", { method: "POST" });
  }, []);

  const rehydrate = useCallback(async () => {
    if (!getToken()) return;
    try {
      const env = await apiRaw<AuthEnvelope>("/auth/", {});
      apply(env);
    } catch {
      /* token invalid, the route guard will redirect to /login */
    }
  }, [apply]);

  /**
   * Keep analytics pointed at whoever is actually signed in.
   *
   * Driven off session state rather than called from each of login/register/OAuth/
   * switchOrg, so a future sign-in path cannot forget to do it. Signing out resets the
   * identity, which matters on the shared front-desk computer every flight school has.
   * without it, the next person's events would be attributed to the last one.
   */
  useEffect(() => {
    if (!session.user) {
      resetIdentity();
      return;
    }
    // Roles are the single most useful property on a person here. A student, an
    // instructor and a dispatcher use almost disjoint halves of this console, so any
    // usage number that isn't split by role is an average of three unrelated things.
    const roles = rolesFromSession();
    identify(
      session.user.id,
      {
        email: session.user.email,
        name: session.user.name,
        roles,
        primary_role: roles[0] ?? "none",
        org_count: session.organizations.length,
      },
      session.organization
        ? { id: session.organization.id, name: session.organization.name }
        : undefined
    );
  }, [session.user, session.organization, session.organizations.length]);

  const logout = useCallback(() => {
    // In a demo tab this must clear the DEMO session and nothing else. The
    // localStorage session belongs to a real account the same person may have
    // open in another tab, and signing out of a sandbox is not a reason to sign
    // them out of their own school. Guarded here rather than at the call sites so
    // no future caller has to remember.
    if (isDemoTab()) {
      clearDemo();
      setSession({ user: null, organization: null, organizations: [] });
      return;
    }

    setToken(null);
    localStorage.removeItem(SESSION_KEY);
    // Signing out means signing out, never leave a parked developer token behind
    // in storage for the next person at this browser.
    clearDevStash();
    setSession({ user: null, organization: null, organizations: [] });
  }, []);

  /**
   * Sign in as another user (developer only, the server enforces it).
   *
   * The developer's own token is parked first so the swap is reversible. Note the
   * resulting session is a *real* session for that user: every request after this
   * carries their permissions, and anything done here is done as them.
   */
  const loginAs = useCallback(
    async (email: string) => {
      const priorToken = getToken();
      const priorSession = localStorage.getItem(SESSION_KEY);
      const priorEmail = session.user?.email ?? "";

      // Request first: a failed lookup must leave the developer exactly where
      // they were, with nothing parked.
      const env = await apiRaw<AuthEnvelope>("/developer/loginAs", {
        method: "POST",
        body: { email: email.trim().toLowerCase() },
      });

      // Park only the FIRST hop. If a session is somehow already impersonated,
      // "exit" must still land on the developer, not on the previous target.
      if (priorToken && priorSession && !readDevStash()) {
        writeDevStash({ token: priorToken, session: priorSession, developerEmail: priorEmail });
      }

      apply(env);
    },
    [apply, session.user?.email]
  );

  //-------------------------------------------------------------------------------
  // The public demo sandbox.
  //
  // Every one of these writes through the same `apply()` the real sign-in paths
  // use (the server returns the identical envelope on purpose) so the demo needs
  // no parallel session handling. The only demo-specific part is WHERE the token
  // lands, and that is settled once, in getToken/setToken and loadSession/
  // saveSession, by whether this tab is a demo tab.
  //-------------------------------------------------------------------------------

  const [demo, setDemo] = useState<DemoMeta | null>(() => getDemoMeta());

  /** Apply a demo envelope. The token has to be stored BEFORE apply() runs. */
  const applyDemo = useCallback(
    (env: AuthEnvelope & { demo: DemoMeta }) => {
      // Order matters: `isDemoTab()` is derived from the presence of the demo
      // token, and apply() calls setToken()/saveSession(), which both branch on
      // it. Writing the token first is what makes this tab a demo tab in time for
      // the session to be stored beside it rather than over the real one.
      setDemoToken(env.auth.accessToken);
      setDemoMeta(env.demo);
      setDemo(env.demo);
      apply(env);
    },
    [apply]
  );

  const startDemo = useCallback(async () => {
    // Collapse concurrent starts into ONE request, at module scope rather than in
    // a component ref.
    //
    // The entry route guards with a ref, and that is not enough: a ref survives
    // re-renders but not REMOUNTS, and applying the session re-renders the auth
    // provider that sits above the router, which remounts the route that just
    // asked for the session. Measured seven mints for one visit before this. That
    // is mostly wasted work, but it also spends a per-IP budget deliberately set
    // low, so the failure mode is a visitor locked out of the demo by the act of
    // opening it.
    //
    // Same shape as the session probe in lib/api.ts, for the same reason: the
    // request is the thing that must be de-duplicated, not the caller.
    if (!demoStartInFlight) {
      demoStartInFlight = apiRaw<AuthEnvelope & { demo: DemoMeta }>("/demo/session", { method: "POST" }).finally(
        () => {
          demoStartInFlight = null;
        }
      );
    }
    applyDemo(await demoStartInFlight);
  }, [applyDemo]);

  const switchDemoRole = useCallback(
    async (orgUserId: number) => {
      const env = await apiRaw<AuthEnvelope & { demo: DemoMeta }>("/demo/switch", {
        method: "POST",
        body: { orgUserId },
      });
      applyDemo(env);
    },
    [applyDemo]
  );

  const resetDemo = useCallback(async () => {
    const env = await apiRaw<AuthEnvelope & { demo: DemoMeta }>("/demo/reset", { method: "POST" });
    applyDemo(env);
  }, [applyDemo]);

  const exitDemo = useCallback(() => {
    // Tell the server first, while the token is still here to authenticate with, so
    // the pool gets this sandbox back now rather than at lease expiry. Best-effort and
    // fire-and-forget, see beaconDemoExit; the reaper reclaims it either way.
    beaconDemoExit();
    clearDemo();
    setDemo(null);
    // Not `logout()`: that clears the LOCALSTORAGE session, which in a demo tab
    // belongs to a real account this visitor may well have open next door.
    // Leaving the demo must leave that alone.
    setSession({ user: null, organization: null, organizations: [] });
  }, []);

  const stopImpersonating = useCallback(() => {
    const stash = readDevStash();
    if (!stash) return false;

    let restored: SessionState;
    try {
      restored = JSON.parse(stash.session) as SessionState;
    } catch {
      // The parked session is unreadable, drop it rather than restore garbage.
      // The caller falls back to sending the developer to /login.
      clearDevStash();
      return false;
    }

    setToken(stash.token);
    localStorage.setItem(SESSION_KEY, stash.session);
    clearDevStash();
    setSession(restored);
    return true;
  }, []);

  const derived = useMemo(() => {
    const ous = session.user?.orgUsers ?? [];
    // /auth already scopes orgUsers to the active org (see rolesFromSession).
    const membership = ous[0] ?? null;
    const roles = membership ? rolesOf(membership) : [];
    const isStaff = roles.some((r) => r === "owner" || r === "admin" || r === "dispatcher");
    const isAdmin = roles.some((r) => r === "owner" || r === "admin");
    // Read from the token, not from state, so a refresh mid-impersonation still
    // shows the banner. `session` is in the dep list because every path that
    // swaps the token also sets session.
    const isImpersonating = decodeImpersonatedBy(getToken()) !== null;
    return {
      membership,
      roles,
      orgUserId: membership?.id ?? null,
      userId: session.user?.id ?? null,
      isStaff,
      isAdmin,
      isDeveloper: isDeveloperEmail(session.user?.email),
      isImpersonating,
      impersonatorEmail: isImpersonating ? (readDevStash()?.developerEmail ?? null) : null,
      // From the token, like `isImpersonating` and for the same reason: the banner
      // is the only thing telling the visitor that none of this is real, so it has
      // to survive a refresh.
      isDemo: decodeDemoOrgId(getToken()) !== null,
    };
  }, [session]);

  return (
    <AuthContext
      value={{
        ...session,
        ...derived,
        login,
        register,
        googleLogin,
        appleLogin,
        logout,
        switchOrg,
        createOrganization,
        joinByCode,
        resendVerificationEmail,
        rehydrate,
        loginAs,
        stopImpersonating,
        demo,
        startDemo,
        switchDemoRole,
        resetDemo,
        exitDemo,
      }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
