import { createFileRoute, redirect } from "@tanstack/react-router";

/** An owner's aircraft are on their home page (Tony, 2026-10-01): the old list address goes there. */
export const Route = createFileRoute("/_authed/me/aircraft/")({
  beforeLoad: () => {
    throw redirect({ to: "/me", replace: true });
  },
});
