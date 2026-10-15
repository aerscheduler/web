import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConnectZoom } from "@/features/queries";
import { ApiError } from "@/lib/api";

/**
 * Where Zoom returns a member after they approve AerScheduler on their account.
 *
 * Zoom needs one fixed redirect URL, registered on AerScheduler's Zoom app, and the server
 * builds it as `${FRONTEND_URL}/integrations/zoom/callback`. This page hands Zoom's code
 * and the signed state back to the API, which checks the state was issued to THIS signed-in
 * member, then lands them back on the Calendar tab where they started.
 */
export const Route = createFileRoute("/_authed/integrations/zoom/callback")({
  validateSearch: (s: Record<string, unknown>): { code?: string; state?: string; error?: string } => ({
    code: typeof s.code === "string" ? s.code : undefined,
    state: typeof s.state === "string" ? s.state : undefined,
    error: typeof s.error === "string" ? s.error : undefined,
  }),
  component: ZoomCallbackPage,
});

function ZoomCallbackPage() {
  const { code, state, error } = Route.useSearch();
  const navigate = useNavigate();
  const connect = useConnectZoom();
  // Strict Mode runs effects twice, and a Zoom code can be redeemed only once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const back = () => void navigate({ to: "/me/profile", search: { tab: "calendar" }, replace: true });

    if (error || !code || !state) {
      toast.info(error === "access_denied" ? "Zoom wasn't connected." : "Zoom didn't finish connecting. Try again.");
      back();
      return;
    }
    connect
      .mutateAsync({ code, state })
      .then((r) => toast.success(r.email ? `Zoom connected as ${r.email}` : "Zoom connected"))
      .catch((err) => toast.error(err instanceof ApiError ? err.message : "Couldn't connect Zoom. Try again."))
      .finally(back);
  }, [code, state, error, connect, navigate]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm font-medium text-foreground">Connecting Zoom</p>
      </div>
    </div>
  );
}
