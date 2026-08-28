import { Gift } from "lucide-react";
import { formatMonthly, formatUnitPrice } from "@/lib/subscription";
import type { PricedTerms } from "@/features/queries";
import { Badge } from "@/components/ui/badge";

/**
 * The bits of the billing-terms UI that both the directory and the org page need.
 *
 * Split out when the developer page grew a route per organization: the state badge
 * and the date formatting are read in a table row AND in the editor, and a second
 * copy of "what colour is expired" is exactly the drift that made a school's status
 * mean two things at once before the terms table existed.
 */

export const MODELS: { value: string; label: string; hint: string }[] = [
  { value: "per_aircraft", label: "Per aircraft", hint: "The standard offer: a monthly price per tail." },
  { value: "legacy_fee", label: "Legacy fee", hint: "Grandfathered: a cut of their Connect invoices, no subscription." },
  { value: "free", label: "Free", hint: "Sponsored indefinitely. Never billed, never nagged, never paywalled." },
];

export const NONE = "not set";

export const modelLabel = (model: string): string =>
  MODELS.find((m) => m.value === model)?.label ?? model;

export function StateBadge({ state }: { state: string }) {
  if (state === "free") return <Badge variant="success"><Gift className="size-3" /> Free</Badge>;
  if (state === "legacy") return <Badge variant="outline">Legacy fee</Badge>;
  if (state === "active") return <Badge variant="success">Paying</Badge>;
  if (state === "expired") return <Badge variant="danger">Blocked</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

/** Dates here are calendar dates somebody typed, anchored to end-of-day UTC by the
 *  server. Render them in UTC so an employee reads back exactly what they entered. */
export const shortDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : NONE;

/** An ISO instant as the value a date input wants. UTC for the same reason. */
export const dateInputValue = (iso: string | null): string =>
  iso ? new Date(iso).toISOString().slice(0, 10) : "";

export function PricedSummary({ priced }: { priced: PricedTerms }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StateBadge state={priced.state} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Owes monthly</dt>
        <dd className="font-medium tabular-nums">{formatMonthly(priced.monthlyCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Aircraft</dt>
        <dd className="tabular-nums">
          {priced.billableUnits} billed of {priced.unitCount}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Unit price</dt>
        <dd className="tabular-nums">{formatUnitPrice(priced.unitPriceCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Connect fee</dt>
        {/* Stored in hundredths of a percent, 50 == 0.5%. Shown as a percentage
            because that is the number anybody says out loud on a call. */}
        <dd className="tabular-nums">{priced.feeRateBasis ? `${priced.feeRateBasis / 100}%` : "none"}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Free until</dt>
        <dd>
          {shortDate(priced.freeUntil)}
          {priced.freeUntilReason ? ` (${priced.freeUntilReason})` : ""}
        </dd>
      </div>
    </dl>
  );
}
