import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * The number row at the top of a record page.
 *
 * Three rules, all learned from reports that stopped being trusted:
 *
 *  - **Deci-hours and cents are converted here, once.** `hours` and `money` take
 *    the server's integer and do the division themselves, so no caller can ship
 *    a tile that is out by 10×.
 *  - **A missing value is an em dash, never a zero.** "We couldn't read this"
 *    and "this is zero" are different facts, and a tile that shows them the same
 *    way is a tile someone will make a decision on.
 *  - **A metric the viewer isn't allowed to see is not rendered.** Not greyed,
 *    not locked, absent. A row of four tiles where one says "restricted" tells
 *    a dispatcher exactly how much revenue exists to go asking about.
 */

export function MetricRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
  );
}

export type MetricTone = "default" | "warning" | "danger" | "success";

const TONE_CLASS: Record<MetricTone, string> = {
  default: "text-foreground",
  warning: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
  danger: "text-[var(--destructive)]",
  success: "text-[var(--success)]",
};

export function MetricTile({
  label,
  value,
  hint,
  icon: Icon,
  loading,
  error,
  tone = "default",
}: {
  label: string;
  /** Already formatted, use `hoursValue`/`moneyValue`/`countValue` to build it. */
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  /** True when the query failed. Shows a dash and a note rather than a stale 0. */
  error?: boolean;
  tone?: MetricTone;
}) {
  return (
    <Card className="p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[13px] font-medium text-muted-foreground">{label}</div>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground/70" />}
      </div>
      {loading ? (
        <Skeleton className="mt-2.5 h-6 w-20" />
      ) : (
        <div
          className={cn(
            "mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.01em] tabular-nums",
            error ? "text-muted-foreground" : TONE_CLASS[tone]
          )}
        >
          {error ? "–" : value}
        </div>
      )}
      {!loading && (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {error ? "Couldn't load" : hint}
        </div>
      )}
    </Card>
  );
}

/** Deci-hours (123 ⇒ "12.3 h"), the server's integer representation for time. */
export function hoursValue(deciHours: number | null | undefined): string {
  if (typeof deciHours !== "number" || !Number.isFinite(deciHours)) return "–";
  return `${(deciHours / 10).toFixed(1)} h`;
}

/** Integer cents ⇒ "$1,234". Whole dollars: a tile is scanned, not reconciled. */
export function moneyValue(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "–";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function countValue(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US");
}
