import { createFileRoute, redirect } from "@tanstack/react-router";

// Push/email links use `/slot-offers/:id`. The member list is the Schedule
// "Slot offers" tab; the id is enough to land there (accept from the card).
export const Route = createFileRoute("/_authed/slot-offers/$offerId")({
  beforeLoad: () => {
    throw redirect({ to: "/me/schedule", search: { tab: "offers" }, replace: true });
  },
});
