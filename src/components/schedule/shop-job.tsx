import { Ban } from "lucide-react";
import type { Reservation, ShopJobSummary } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * The shop's summary of the job a maintenance booking holds (Murray spec section 8): the customer,
 * what they asked for, and whether the aircraft is grounded. The server sends it only to the shop
 * roles, and the request only to the people who open work orders, so a block or a sheet shows
 * exactly what arrived and decides nothing itself.
 */
export function shopJobOf(r: Reservation): ShopJobSummary | null {
  return r.type === "maintenance" && r.shopJob ? r.shopJob : null;
}

/** "Dale Whitcomb · Annual inspection", or whichever half there is. */
export function shopJobLine(s: ShopJobSummary): string | null {
  const parts = [s.customerName, s.request].filter((p): p is string => !!p && !!p.trim());
  return parts.length ? parts.join(" · ") : null;
}

/** The grounded mark: amber, never red (a grounded aircraft is a fact to plan around, not an error). */
export function GroundedMark({ className }: { className?: string }) {
  return (
    <Ban
      className={cn("inline size-3 shrink-0 text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]", className)}
      aria-label="Aircraft grounded"
      role="img"
    />
  );
}
