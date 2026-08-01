import { useCallback, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  expireSession,
  getToken,
  isTokenExpired,
  setUnauthorizedHandler,
  tokenIsDead,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Routes that already assume you are signed out. Landing on one of these with a
 * dead token is not an event worth announcing — you are where you belong.
 */
const SIGNED_OUT_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"];

function isSignedOutRoute(pathname: string) {
  return SIGNED_OUT_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Only bounce back to somewhere inside this app. */
function safeRedirect(href: string): string | undefined {
  if (!href.startsWith("/") || href.startsWith("//")) return undefined;
  return isSignedOutRoute(new URL(href, window.location.origin).pathname) ? undefined : href;
}

/**
 * Turns a dead session into something the user can see.
 *
 * Before this existed, a 401 quietly deleted the token and left the app on
 * screen looking perfectly signed in: the shell rendered, the cached data was
 * all still there, and you only discovered you were logged out when the *next*
 * request failed for no stated reason — or when you reloaded and landed on
 * /login. This closes both halves of that gap:
 *
 *  - reactive: the moment the API confirms the session is gone, say so and go
 *    to /login, remembering where the user was
 *  - proactive: re-check when the tab comes back to the foreground, so coming
 *    back to a long-idle tab tells you up front instead of after a failed click
 *
 * Renders nothing.
 */
export function SessionWatcher() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // `expireSession` fires this exactly once per token, so no extra de-duping is
  // needed here even when a screenful of queries all 401 together.
  const onExpired = useCallback(() => {
    const here = window.location.pathname + window.location.search;
    const onSignedOutRoute = isSignedOutRoute(window.location.pathname);

    logout();
    // Someone else's data must not be sitting in the cache for the next sign-in.
    qc.clear();

    if (onSignedOutRoute) return;

    toast.error("You've been signed out", {
      description: "Your session expired. Please sign in again to pick up where you left off.",
    });
    void navigate({
      to: "/login",
      search: { redirect: safeRedirect(here) },
      replace: true,
    });
  }, [logout, navigate, qc]);

  useEffect(() => {
    setUnauthorizedHandler(onExpired);
    return () => setUnauthorizedHandler(null);
  }, [onExpired]);

  // Proactive check when the tab comes back into view.
  useEffect(() => {
    let lastProbe = 0;

    const check = () => {
      // "Is the user actually here?" — either answer is good enough. Checking
      // only visibilityState misses environments that report a focused window
      // as hidden, and there is no point probing for a backgrounded tab.
      if (document.visibilityState !== "visible" && !document.hasFocus()) return;
      const token = getToken();
      if (!token) return;

      // The token says so itself — no round trip needed.
      if (isTokenExpired(token)) {
        expireSession(token);
        return;
      }

      // Otherwise ask the server, but not on every focus event: alt-tabbing is
      // constant, and a token that just checked out is not going to have died
      // in the last minute.
      if (Date.now() - lastProbe < 60_000) return;
      lastProbe = Date.now();
      void tokenIsDead(token).then((dead) => {
        if (dead) expireSession(token);
      });
    };

    // Signing out in one tab should not leave another tab looking signed in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "aer.token" && e.newValue === null) onExpired();
    };

    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("storage", onStorage);
    check();

    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [onExpired]);

  return null;
}
