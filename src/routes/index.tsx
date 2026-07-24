import { createFileRoute, redirect } from "@tanstack/react-router";
import { isAuthenticated, isStaffSync } from "@/lib/auth";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    throw redirect({ to: isStaffSync() ? "/dashboard" : "/me" });
  },
});
