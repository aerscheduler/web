import { createFileRoute, redirect } from "@tanstack/react-router";

// The mobile app has long used this path. Keep Universal Links and older bookmarks
// working while routing the web console to the new Security tab.
export const Route = createFileRoute("/_authed/organization-settings")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", search: { tab: "security" }, replace: true });
  },
});
