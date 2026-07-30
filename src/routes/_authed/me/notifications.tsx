import { createFileRoute } from "@tanstack/react-router";
import { NotificationPreferencesPage } from "@/components/me-account/notification-preferences";

export const Route = createFileRoute("/_authed/me/notifications")({
  component: NotificationPreferencesPage,
});
