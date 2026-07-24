import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { apiRaw, getToken, setToken } from "./api";
import type { Organization, User } from "@/types/api";

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

interface AuthContextValue extends SessionState {
  login: (email: string, password: string) => Promise<void>;
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

  return (
    <AuthContext
      value={{ ...session, login, logout, switchOrg, createOrganization, rehydrate }}
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
