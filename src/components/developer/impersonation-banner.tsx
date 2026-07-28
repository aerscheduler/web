import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { EyeOff, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

/**
 * A standing reminder that you are signed in as someone else, and the way back out.
 *
 * Rendered ABOVE the subscription gate on purpose. The gate replaces the whole
 * app shell with a paywall when an org's access has lapsed — which is exactly the
 * kind of org you get asked to troubleshoot — so a banner living inside the shell
 * would vanish precisely when it is needed, stranding the developer in someone
 * else's account with no exit.
 *
 * Deliberately loud. Every action taken from here is attributed to the customer,
 * so "which account am I in?" should never be a question you have to ask.
 */
export function ImpersonationBanner() {
  const { isImpersonating, user, impersonatorEmail, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  if (!isImpersonating) return null;

  const exit = () => {
    const restored = stopImpersonating();
    // Every cached query belongs to the impersonated user — drop the lot rather
    // than let one screen's stale data bleed into the next session.
    qc.clear();

    if (restored) {
      toast.success("Back to your own account");
      void navigate({ to: "/developer" });
      return;
    }

    // No parked session to restore (storage cleared, or a token that outlived it).
    toast.message("Signed out of the impersonated account");
    void navigate({ to: "/login" });
  };

  return (
    <div
      className="flex flex-col gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm sm:flex-row sm:items-center sm:justify-between md:px-10"
      data-testid="impersonation-banner"
    >
      <div className="flex items-start gap-2.5">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
        <div>
          <span className="font-medium">
            Viewing as {user?.name ?? "this user"}
            {user?.email ? ` (${user.email})` : ""}
          </span>{" "}
          <span className="text-muted-foreground">
            Anything you do here is recorded as them. Session expires in an hour.
          </span>
        </div>
      </div>

      <Button size="sm" variant="outline" onClick={exit} className="shrink-0 self-start sm:self-auto">
        <LogOut className="size-4" />
        {impersonatorEmail ? `Back to ${impersonatorEmail}` : "Exit"}
      </Button>
    </div>
  );
}
