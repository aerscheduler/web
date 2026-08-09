import { createFileRoute, redirect } from "@tanstack/react-router";

// Slot offers live as a tab under Schedule. Keep the old path working
// (bookmarks / notification deep links that still point here).
export const Route = createFileRoute("/_authed/me/slot-offers")({
  beforeLoad: () => {
    throw redirect({ to: "/me/schedule", search: { tab: "offers" }, replace: true });
  },
});
