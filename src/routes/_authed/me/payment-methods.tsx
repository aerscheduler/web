import { createFileRoute, redirect } from "@tanstack/react-router";

// Payment methods now live as a tab under Profile. Keep the old path working
// (bookmarks, and the Stripe add-card return URL) by redirecting to that tab.
export const Route = createFileRoute("/_authed/me/payment-methods")({
  beforeLoad: () => {
    throw redirect({ to: "/me/profile", search: { tab: "payments" }, replace: true });
  },
});
