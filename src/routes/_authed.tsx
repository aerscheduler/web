import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAuthenticated, needsEmailVerification } from "@/lib/auth";
import { SubscriptionGate } from "@/components/subscription/gate";

export const Route = createFileRoute("/_authed")({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
    // Email must be verified before using the app (matches the Flutter app;
    // bypassed on local dev).
    if (needsEmailVerification()) {
      throw redirect({ to: "/verify-email" });
    }
  },
  component: AuthedLayout,
});

// The subscription gate owns the app shell so it can either render the app
// (with a trial/grace banner) or replace it with the paywall when access lapses.
function AuthedLayout() {
  return <SubscriptionGate />;
}
