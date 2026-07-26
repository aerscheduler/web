import { createFileRoute, redirect } from "@tanstack/react-router";

// Availability now lives as a tab under Profile. Keep the old path working
// (bookmarks / deep links) by redirecting to that tab.
export const Route = createFileRoute("/_authed/me/availability")({
  beforeLoad: () => {
    throw redirect({ to: "/me/profile", search: { tab: "availability" }, replace: true });
  },
});
