import { format, parseISO } from "date-fns";
import { CalendarX2, Clock, FileText, Plane, User, Users } from "lucide-react";
import type { CancelledReservation, ReservationType } from "@/types/api";
import { cancelledForLabel, cancelledResourceLabel } from "@/types/api";
import { SheetDetailField, SheetDetailFields } from "@/components/sheet-detail-field";
import { DOT_CLASS, typeLabel } from "@/components/schedule/meta";
import { DetailPanel } from "@/components/detail-panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  return format(parseISO(iso), "EEEE, MMMM d, yyyy");
}

function fmtDateTime(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy 'at' h:mm a") : "–";
}

function reservationType(t: string): ReservationType {
  return t as ReservationType;
}

/** Full cancellation record, same sheet chrome as `ReservationDetailSheet`. */
export function CancellationDetailSheet({
  cancellation,
  open,
  onOpenChange,
  onStep,
}: {
  cancellation: CancelledReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ↑/↓ through the cancellations on screen while the panel is docked. */
  onStep?: (delta: -1 | 1) => void;
}) {
  const row = cancellation;
  const resName = row ? cancelledResourceLabel(row.resource) : "–";
  const forLabel = row ? cancelledForLabel(row) : "–";
  const type = row ? reservationType(row.type) : null;
  const dotClass = type && DOT_CLASS[type] ? DOT_CLASS[type] : "bg-muted";

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={row?.title ?? ""}
      description={row ? fmtDate(row.start) : undefined}
      badge={
        row ? (
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={cn("size-2.5 rounded-full", dotClass)} aria-hidden />
            <Badge variant="outline">{type ? typeLabel(type) : row.type}</Badge>
          </span>
        ) : undefined
      }
    >
      {row && (
        <div className="space-y-5 pt-4">
          {/* The category and short-notice chips moved out of the header: the panel
              header holds one badge, and these two are findings about the
              cancellation rather than what it is. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{row.categoryLabel}</Badge>
            {row.isLate && (
              <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                Short notice
              </Badge>
            )}
          </div>

          <SheetDetailFields>
            <SheetDetailField icon={Clock} label="Scheduled">
              <span className="tabular-nums">
                {format(parseISO(row.start), "h:mm a")} –{" "}
                {format(parseISO(row.end), "h:mm a")}
              </span>
            </SheetDetailField>

            <SheetDetailField icon={CalendarX2} label="Cancelled">
              <span className="tabular-nums">{fmtDateTime(row.cancelledAt)}</span>
            </SheetDetailField>

            <SheetDetailField icon={User} label="Cancelled by">
              {row.cancelledBy?.user?.name ?? (
                <span className="text-muted-foreground">–</span>
              )}
            </SheetDetailField>

            <SheetDetailField icon={Plane} label="Resource">
              <span className="font-medium">{resName}</span>
            </SheetDetailField>

            <SheetDetailField icon={Users} label="Personnel">
              {forLabel !== "–" ? (
                forLabel
              ) : (
                <span className="text-muted-foreground">No one assigned</span>
              )}
            </SheetDetailField>

            <SheetDetailField icon={FileText} label="Cancellation note" stacked>
              {row.cancellationReason?.trim() ? (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {row.cancellationReason}
                </p>
              ) : (
                <span className="text-muted-foreground">–</span>
              )}
            </SheetDetailField>
          </SheetDetailFields>
        </div>
      )}
    </DetailPanel>
  );
}
