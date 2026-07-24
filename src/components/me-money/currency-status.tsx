import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Currency } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";

export type CurrencyStatusKey = "expired" | "expiring" | "current";

export interface CurrencyStatus {
  key: CurrencyStatusKey;
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
}

/** Days out from today an expiry counts as "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

/**
 * Derive a currency's status from its expiry: past → expired, within 30 days →
 * expiring soon, otherwise current. No expiry on file is treated as current.
 */
export function currencyStatus(c: Currency, now: Date = new Date()): CurrencyStatus {
  if (!c.expiresAt) return { key: "current", label: "Current", variant: "success" };
  const days = differenceInCalendarDays(parseISO(c.expiresAt), now);
  if (days < 0) return { key: "expired", label: "Expired", variant: "danger" };
  if (days <= EXPIRING_SOON_DAYS)
    return { key: "expiring", label: "Expiring soon", variant: "warning" };
  return { key: "current", label: "Current", variant: "success" };
}

export function CurrencyStatusBadge({ status }: { status: CurrencyStatus }) {
  return <Badge variant={status.variant}>{status.label}</Badge>;
}
