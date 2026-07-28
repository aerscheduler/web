import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRaw, getToken, setToken } from "./api";
import { signInWithGoogle } from "./google";
import { signInWithApple } from "./apple";
import {
  clearDevStash,
  decodeImpersonatedBy,
  isDeveloperEmail,
  readDevStash,
  writeDevStash,
} from "./developer";
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

function loadSession(): SessionState {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {
    /* ignore */
  }
  return { user: null, organization: null, organizations: [] };
}

function saveSession(s: SessionState) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

/** Read synchronously — used by the router guard before React renders. */
export function isAuthenticated(): boolean {
  return Boolean(getToken());
}

/** The caller's roles in the active org, read synchronously from the stored
 * session — used by router guards before React renders. */
export function rolesFromSession(): Role[] {
  const s = loadSession();
  const ous = s.user?.orgUsers ?? [];
  // The server's /auth scopes `user.orgUsers` to the ACTIVE org (org switch does a
  // full reload), so the first (only) entry is the caller's active-org membership.
  // We can't match on FK_organizationId — the server strips every FK_* field.
  const membership = ous[0];
  return membership ? rolesOf(membership) : [];
}

/** Synchronous staff check from the stored session (owner/admin/dispatcher). */
export function isStaffSync(): boolean {
  return rolesFromSession().some((r) => r === "owner" || r === "admin" || r === "dispatcher");
}

/** Synchronous developer check from the stored session — for the /developer route
 *  guard. Cosmetic: the server enforces the same allowlist on every request. */
export function isDeveloperSync(): boolean {
  return isDeveloperEmail(loadSession().user?.email);
}

/** True if the stored session has an active organization. */
export function hasActiveOrg(): boolean {
  return loadSession().organization != null;
}

/** True if the signed-in user has verified their email. Read synchronously from
 *  the stored session for router guards — mirrors the Flutter app, which already
 *  blocks unverified users after signup. */
export function isEmailVerifiedSync(): boolean {
  return Boolean(loadSession().user?.emailVerifiedAt);
}

/** True when the current token was minted by `POST /developer/loginAs`. Read from
 *  the token itself so it survives a refresh. */
export function isImpersonatingSync(): boolean {
  return decodeImpersonatedBy(getToken()) !== null;
}

/** Whether the email-verification gate should apply. Bypassed on local dev
 *  (`npm run dev`) so onboarding is testable without a real verification link —
 *  the dev server talks to the prod API, which never auto-verifies. Enforced in
 *  every built (preview/prod) bundle.
 *
 *  Also bypassed while impersonating: /verify-email is a dead end for a developer
 *  (you cannot click a link sent to someone else's inbox), and troubleshooting an
 *  unverified account is exactly when you need to get in and look. */
export function needsEmailVerification(): boolean {
  return !import.meta.env.DEV && !isEmailVerifiedSync() && !isImpersonatingSync();
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
   * Join a school by its code. Returns "joined" (public/invited — token swapped to the new org)
   * or "requested" (private school — a join request was sent for an admin to approve).
   */
  joinByCode: (code: string) => Promise<"joined" | "requested">;
  /** Re-send the account verification email to the signed-in user. */
  resendVerificationEmail: () => Promise<void>;
  rehydrate: () => Promise<void>;
  /** True if this user's email is on the developer allowlist (UI gating only —
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(() =>
    getToken() ? loadSession() : { user: null, organization: null, organizations: [] }
  );

  const apply = useCallback((env: AuthEnvelope) => {
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
      /* token invalid — the route guard will redirect to /login */
    }
  }, [apply]);

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(SESSION_KEY);
    // Signing out means signing out — never leave a parked developer token behind
    // in storage for the next person at this browser.
    clearDevStash();
    setSession({ user: null, organization: null, organizations: [] });
  }, []);

  /**
   * Sign in as another user (developer only — the server enforces it).
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

  const stopImpersonating = useCallback(() => {
    const stash = readDevStash();
    if (!stash) return false;

    let restored: SessionState;
    try {
      restored = JSON.parse(stash.session) as SessionState;
    } catch {
      // The parked session is unreadable — drop it rather than restore garbage.
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
