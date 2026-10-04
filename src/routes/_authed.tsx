import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAuthenticated, isOutsideOwnerSync, needsEmailVerification } from "@/lib/auth";
import { SubscriptionGate } from "@/components/subscription/gate";

/** Where an outside owner may go: exact paths, or a prefix when it ends in "/". */
const OUTSIDE_OWNER_PATHS = ["/me", "/me/aircraft", "/me/aircraft/", "/me/jobs/", "/me/invoices", "/me/profile", "/me/notifications", "/me/payment-methods", "/notifications"];

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ location }) => {
    if (!isAuthenticated()) {
      // Remember the page so signing back in returns to it rather than dumping
      // everyone on the dashboard.
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
    // Email must be verified before using the app (matches the Flutter app;
    // bypassed on local dev).
    if (needsEmailVerification()) {
      throw redirect({ to: "/verify-email" });
    }
    // An aircraft owner from outside the organization has their own aircraft, jobs and bills,
    // and their account. Anything else (a bookmark, a link in an email meant for staff) goes
    // home rather than to a page whose every request the server refuses.
    if (isOutsideOwnerSync() && !OUTSIDE_OWNER_PATHS.some((p) => (p.endsWith("/") ? location.pathname.startsWith(p) : location.pathname === p))) {
      throw redirect({ to: "/me" });
    }
  },
  component: AuthedLayout,
});

// The subscription gate owns the app shell so it can either render the app
// (with a trial/grace banner) or replace it with the paywall when access lapses.
function AuthedLayout() {
  return <SubscriptionGate />;
}
