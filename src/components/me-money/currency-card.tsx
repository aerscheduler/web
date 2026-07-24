import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { ShieldCheck } from "lucide-react";
import type { Currency } from "@/types/api";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CurrencyStatusBadge, currencyStatus } from "./currency-status";

function fmtDate(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy") : null;
}

const TONE: Record<string, string> = {
  current:
    "bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-[var(--success)]",
  expiring:
    "bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] text-[color-mix(in_oklch,var(--warning)_65%,var(--foreground))]",
  expired:
    "bg-[color-mix(in_oklch,var(--destructive)_14%,transparent)] text-[var(--destructive)]",
};

export function CurrencyCard({ currency }: { currency: Currency }) {
  const status = currencyStatus(currency);
  const name = currency.currencyType?.name ?? "Currency";
  const expires = fmtDate(currency.expiresAt);
  const relative = currency.expiresAt
    ? formatDistanceToNowStrict(parseISO(currency.expiresAt), { addSuffix: true })
    : null;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-lg",
              TONE[status.key]
            )}
          >
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{name}</div>
            {currency.currencyType?.description && (
              <div className="truncate text-xs text-muted-foreground">
                {currency.currencyType.description}
              </div>
            )}
          </div>
        </div>
        <CurrencyStatusBadge status={status} />
      </div>

      <div className="flex items-end justify-between gap-3 border-t border-border pt-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">
            {status.key === "expired" ? "Expired" : "Expires"}
          </div>
          <div className="tnum font-medium">{expires ?? "No expiry on file"}</div>
        </div>
        {relative && (
          <div
            className={cn(
              "tnum text-xs",
              status.key === "expired"
                ? "text-[var(--destructive)]"
                : status.key === "expiring"
                  ? "text-[color-mix(in_oklch,var(--warning)_65%,var(--foreground))]"
                  : "text-muted-foreground"
            )}
          >
            {relative}
          </div>
        )}
      </div>
    </Card>
  );
}
