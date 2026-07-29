import { format, parseISO } from "date-fns";
import { CalendarX2, Clock, FileText, Plane, User, Users } from "lucide-react";
import type { CancelledReservation, ReservationType } from "@/types/api";
import { cancelledForLabel, cancelledResourceLabel } from "@/types/api";
import { SheetDetailField } from "@/components/sheet-detail-field";
import { DOT_CLASS, typeLabel } from "@/components/schedule/meta";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function fmtDate(iso: string) {
  return format(parseISO(iso), "EEEE, MMMM d, yyyy");
}

function fmtDateTime(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy 'at' h:mm a") : "—";
}

function reservationType(t: string): ReservationType {
  return t as ReservationType;
}

/** Full cancellation record — same sheet chrome as `ReservationDetailSheet`. */
export function CancellationDetailSheet({
  cancellation,
  open,
  onOpenChange,
}: {
  cancellation: CancelledReservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const row = cancellation;
  const resName = row ? cancelledResourceLabel(row.resource) : "—";
  const forLabel = row ? cancelledForLabel(row) : "—";
  const type = row ? reservationType(row.type) : null;
  const dotClass = type && DOT_CLASS[type] ? DOT_CLASS[type] : "bg-muted";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {row && (
          <>
            <SheetHeader>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("size-2.5 rounded-full", dotClass)} aria-hidden />
                <Badge variant="outline">{type ? typeLabel(type) : row.type}</Badge>
                <Badge variant="secondary">{row.categoryLabel}</Badge>
                {row.isLate && (
                  <Badge variant="outline" className="text-amber-600 dark:text-amber-500">
                    Short notice
                  </Badge>
                )}
              </div>
              <SheetTitle className="text-balance">{row.title}</SheetTitle>
              <SheetDescription>{fmtDate(row.start)}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
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
                  <span className="text-muted-foreground">—</span>
                )}
              </SheetDetailField>

              <SheetDetailField icon={Plane} label="Resource">
                <span className="font-medium">{resName}</span>
              </SheetDetailField>

              <SheetDetailField icon={Users} label="Personnel">
                {forLabel !== "—" ? (
                  forLabel
                ) : (
                  <span className="text-muted-foreground">No one assigned</span>
                )}
              </SheetDetailField>

              <SheetDetailField icon={FileText} label="Cancellation note">
                {row.cancellationReason?.trim() ? (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    {row.cancellationReason}
                  </p>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </SheetDetailField>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
