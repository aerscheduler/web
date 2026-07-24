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

/** Synchronous staff check from the stored session (owner/admin/dispatcher). */
export function isStaffSync(): boolean {
  const s = loadSession();
  const ous = s.user?.orgUsers ?? [];
  const membership =
    (s.organization ? ous.find((o) => o.FK_organizationId === s.organization!.id) : undefined) ??
    ous[0];
  if (!membership) return false;
  return rolesOf(membership).some((r) => r === "owner" || r === "admin" || r === "dispatcher");
}

/** True if the stored session has an active organization. */
export function hasActiveOrg(): boolean {
  return loadSession().organization != null;
}

/** Where to send a user right after authenticating, based on the fresh session. */
export function postLoginPath(): "/onboarding" | "/dashboard" | "/me" {
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
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Sign in / sign up with Google (opens the Google account chooser). */
  googleLogin: () => Promise<void>;
  logout: () => void;
  switchOrg: (orgId: number) => Promise<void>;
  /** Create a new org (caller becomes owner+admin). Swaps the active token. */
  createOrganization: (input: Record<string, unknown>) => Promise<Organization>;
  rehydrate: () => Promise<void>;
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
    setSession({ user: null, organization: null, organizations: [] });
  }, []);

  const derived = useMemo(() => {
    const ous = session.user?.orgUsers ?? [];
    const membership =
      (session.organization
        ? ous.find((o) => o.FK_organizationId === session.organization!.id)
        : undefined) ??
      ous[0] ??
      null;
    const roles = membership ? rolesOf(membership) : [];
    const isStaff = roles.some((r) => r === "owner" || r === "admin" || r === "dispatcher");
    return {
      membership,
      roles,
      orgUserId: membership?.id ?? null,
      userId: session.user?.id ?? null,
      isStaff,
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
        logout,
        switchOrg,
        createOrganization,
        rehydrate,
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
