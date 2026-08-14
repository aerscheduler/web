import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Stat row that follows the pane, not the viewport. Four cards stay 2×2 until
 * the column itself is wide enough; a docked detail panel shrinks the content
 * without changing `lg`, and `lg:grid-cols-4` is what used to keep four cards
 * in a row and scroll the whole window sideways.
 */
export function StatGrid({
  children,
  className,
  wideCols = 4,
}: {
  children: ReactNode;
  className?: string;
  /** Columns once the pane is wide enough. Stays 2×2 below that. */
  wideCols?: 3 | 4;
}) {
  return (
    <div className={cn("@container min-w-0 shrink-0", className)}>
      <div
        className={cn(
          "grid grid-cols-2 gap-4",
          wideCols === 3 ? "@4xl:grid-cols-3" : "@4xl:grid-cols-4",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  accent = "primary",
  to,
  search,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
  accent?: "primary" | "warning" | "success";
  /** When set, the whole card is a link. A stat nobody can click is a number
   *  with no next step: every tile should land on the list behind it. */
  to?:
    | "/me/schedule"
    | "/me/invoices"
    | "/me/currencies"
    | "/people"
    | "/compliance"
    | "/billing"
    | "/training"
    | "/aircraft"
    | "/schedule";
  /** Search params for `to`, so a tile can land on the filtered list it counts. */
  search?: Record<string, string>;
}) {
  const tone =
    accent === "warning"
      ? "bg-[color-mix(in_oklch,var(--warning)_16%,transparent)] text-[color-mix(in_oklch,var(--warning)_65%,var(--foreground))]"
      : accent === "success"
        ? "bg-[color-mix(in_oklch,var(--success)_14%,transparent)] text-[var(--success)]"
        : "bg-primary/10 text-primary";

  const body = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
        {loading ? (
          <Skeleton className="mt-2 h-6 w-24" />
        ) : (
          <div className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.01em] tabular-nums">
            {value}
          </div>
        )}
        {hint && !loading && (
          <div className="mt-1.5 text-xs text-muted-foreground">{hint}</div>
        )}
      </div>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", tone)}>
        <Icon className="size-4" />
      </span>
    </div>
  );

  if (!to) {
    return <Card className="p-4">{body}</Card>;
  }

  return (
    <Link
      to={to}
      search={search}
      aria-label={label}
      className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="p-4 transition-colors hover:bg-muted/40">
        {body}
      </Card>
    </Link>
  );
}
