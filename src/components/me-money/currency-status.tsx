import type { Currency } from "@/types/api";
import { currencyStanding } from "@/components/me/currency";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

export type CurrencyStatusKey = "expired" | "expiring" | "current" | "notSignedOff";

export interface CurrencyStatus {
  key: CurrencyStatusKey;
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
}

/**
 * Present a currency's standing, using the server's own definition (see
 * `currencyStanding`). Booking is gated on exactly this, so the badge must not
 * be more optimistic than the server.
 *
 * ⚠️ This used to derive status from a `Currency.expiresAt` field that doesn't
 * exist, and treated "no expiry on file" as Current — so a currency that had
 * never been signed off showed a green badge to a pilot the server would refuse
 * to dispatch. Never infer currency from dates alone; `renewedBy` is what makes
 * a currency count.
 */
export function currencyStatus(c: Currency): CurrencyStatus {
  switch (currencyStanding(c)) {
    case "expired":
      return { key: "expired", label: "Expired", variant: "danger" };
    case "expiring":
      return { key: "expiring", label: "Expiring soon", variant: "warning" };
    case "notSignedOff":
      return { key: "notSignedOff", label: "Not signed off", variant: "warning" };
    default:
      return { key: "current", label: "Current", variant: "success" };
  }
}

export function CurrencyStatusBadge({ status }: { status: CurrencyStatus }) {
  return <Badge variant={status.variant}>{status.label}</Badge>;
}
