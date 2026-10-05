/**
 * "Set up your shop", one line on Maintenance > Open jobs, linking to Settings > Shop rates.
 *
 * For an organization that already flies and is starting a shop (Murray): it never sees the
 * shop signup, and its dashboard checklist retired long ago, so nothing else says where to
 * begin. The same one-line callout as "Get first dibs on cancelled slots" on My schedule
 * (FirstDibsCallout): a link to the settings, never a form or a walkthrough on the board
 * (Tony, 2026-10-04: "Should just be a link to go set them up").
 *
 * Shown to admins until the shop has a labor rate, which is the setting whose absence blocks
 * people (a technician cannot log an hour without it). A technician who is not an admin gets the
 * Open jobs empty state saying an admin sets it instead (work-order-table.tsx).
 */

import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, isAdmin } from "@/lib/permissions";
import { useWorkOrderSettings } from "@/features/queries";
import { Button } from "@/components/ui/button";

const dismissKey = (orgUserId: number) => `aer.shopSetupCallout.dismissed.${orgUserId}`;

function readDismissed(orgUserId: number | null | undefined): boolean {
  if (orgUserId == null) return false;
  try {
    return window.localStorage.getItem(dismissKey(orgUserId)) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(orgUserId: number) {
  try {
    window.localStorage.setItem(dismissKey(orgUserId), "1");
  } catch {
    // Private mode or blocked storage: the callout simply comes back next visit.
  }
}

export function ShopSetupCallout() {
  const { roles, orgUserId } = useAuth();
  const admin = isAdmin(roles);
  const rates = useWorkOrderSettings({ enabled: canOpenWorkOrders(roles) });
  const [dismissed, setDismissed] = React.useState(() => readDismissed(orgUserId));

  if (rates.isPending || rates.isError || rates.data?.laborRateCents != null) return null;

  if (!admin) return null;

  if (dismissed || orgUserId == null) return null;
  return (
    <div data-testid="shop-setup-callout" className="flex shrink-0 items-center gap-1 rounded-lg border bg-card pr-1 text-sm">
      <Link
        to="/settings"
        search={{ tab: "shop-rates" } as never}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-l-lg py-2.5 pl-3 hover:bg-accent/50"
      >
        <Wrench className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium">Set up your shop</span>
          <span className="hidden text-muted-foreground sm:inline"> Your labor rate and markups price every job.</span>
        </span>
        <span className="flex shrink-0 items-center font-medium text-primary">
          Set up <ChevronRight className="size-4" aria-hidden />
        </span>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground"
        aria-label="Dismiss"
        onClick={() => {
          writeDismissed(orgUserId);
          setDismissed(true);
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
