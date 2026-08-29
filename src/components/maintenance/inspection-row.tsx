/**
 * One inspection, with how much is left on it.
 *
 * The layout answers the mechanic's question in the order it gets asked: WHAT is it, HOW
 * MUCH is left, and only then the detail. So the figure sits hard right in a fixed column,
 * tabular-aligned, and every row's figure lines up down the card, you can scan the column
 * without reading the names.
 *
 * The rail underneath is how full the interval is, not how much time has passed. On an
 * hour-based item those are very different things: an aircraft that flew 80 hours in a
 * month is nearly due on its 100-hour even though the calendar has barely moved.
 */

import { AlertTriangle } from "lucide-react";
import type { MaintenanceReminder } from "@/types/api";
import { alsoLabel, dueAmount, dueBadge, dueDetail, duePercent, dueTone, sourceBadge, sourceLabel } from "@/lib/maintenance";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const RAIL: Record<string, string> = {
  danger: "bg-destructive",
  warning: "bg-[var(--warning)]",
  success: "bg-[var(--success)]",
  muted: "bg-primary",
};

const FIGURE: Record<string, string> = {
  danger: "text-destructive",
  warning: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
  success: "text-muted-foreground",
  muted: "text-foreground",
};

export function InspectionRow({
  reminder,
  onClick,
  action,
  className,
}: {
  reminder: MaintenanceReminder;
  onClick?: () => void;
  action?: React.ReactNode;
  className?: string;
}) {
  const due = reminder.due;
  const tone = dueTone(due);
  const badge = dueBadge(due);
  const percent = duePercent(due);
  const name = due?.name ?? reminder.template?.name ?? "Inspection";
  // On a combined interval, the clock that is NOT the one binding. The headline figure is
  // whichever comes first; this is the one that could overtake it.
  const also = alsoLabel(due);

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium">{name}</span>
          {badge && (
            <Badge variant={tone === "danger" ? "danger" : "warning"} className="shrink-0">
              {badge}
            </Badge>
          )}
          {/* Which rule this is, so a regulation is distinguishable from an oil change at a
              glance. Two letters, because the row's right-hand column is the countdown a
              mechanic actually scans and it must not be crowded. */}
          {sourceBadge(reminder.template ?? {}) && (
            <Badge
              variant="outline"
              className="shrink-0"
              title={sourceLabel(reminder.template ?? {}) ?? undefined}
            >
              {sourceBadge(reminder.template ?? {})}
            </Badge>
          )}
          {/* Only worth saying on an item that is actually late, on a green row it is a
              rule, not news, and it would sit on every line of the card. */}
          {due?.grounds && due.status === "overdue" && (
            <span
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-destructive"
              title="This one grounds the aircraft."
            >
              <AlertTriangle className="size-3" /> Grounds
            </span>
          )}
        </div>
        <span className={cn("shrink-0 text-[13px] font-semibold tabular-nums", FIGURE[tone])}>
          {dueAmount(due)}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2.5">
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full transition-[width]", RAIL[tone])}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {dueDetail(due)}
          {also && <span className="text-muted-foreground/70"> {also}.</span>}
        </span>
      </div>
    </>
  );

  return (
    <li className={cn("flex items-start gap-3 py-2.5 first:pt-0 last:pb-0", className)}>
      {onClick ? (
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left hover:opacity-80">
          {body}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{body}</div>
      )}
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </li>
  );
}
