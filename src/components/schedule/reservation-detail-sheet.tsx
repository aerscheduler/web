import { format, parseISO } from "date-fns";
import { Ban, Clock, FileText, MapPin, Plane, Users, UserX } from "lucide-react";
import type { ReactNode } from "react";
import { resourceLabel, type Reservation } from "@/types/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DOT_CLASS, personnelNames, typeLabel } from "./meta";
import { CloseOutSection } from "./close-out-section";

/** Slide-over with the full reservation record + destructive actions. */
export function ReservationDetailSheet({
  reservation,
  open,
  onOpenChange,
  onCancel,
  onNoShow,
}: {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (r: Reservation) => void;
  onNoShow: (r: Reservation) => void;
}) {
  const r = reservation;
  const res = r?.resource ? resourceLabel(r.resource) : null;
  const names = r ? personnelNames(r) : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        {r && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", DOT_CLASS[r.type])} aria-hidden />
                <Badge variant="outline">{typeLabel(r.type)}</Badge>
              </div>
              <SheetTitle className="text-balance">{r.title}</SheetTitle>
              <SheetDescription>{format(parseISO(r.start), "EEEE, MMMM d, yyyy")}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              <Field icon={Clock} label="Time">
                <span className="tabular-nums">
                  {format(parseISO(r.start), "h:mm a")} – {format(parseISO(r.end), "h:mm a")}
                </span>
                <span className="ml-2 text-muted-foreground">{r.timeZoneName}</span>
              </Field>

              <Field icon={Plane} label="Resource">
                {res ? (
                  <span>
                    <span className="font-medium">{res.name}</span>
                    <span className="ml-2 text-muted-foreground">{res.kind}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </Field>

              {r.resource?.location?.name && (
                <Field icon={MapPin} label="Location">
                  {r.resource.location.name}
                </Field>
              )}

              <Field icon={Users} label="Personnel">
                {names.length > 0 ? (
                  <ul className="space-y-0.5">
                    {names.map((n, i) => (
                      <li key={`${n}-${i}`}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">No one assigned</span>
                )}
              </Field>

              {r.notes && (
                <Field icon={FileText} label="Notes">
                  <p className="whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
                </Field>
              )}

              <CloseOutSection reservation={r} />
            </div>

            <SheetFooter>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onNoShow(r)}
                >
                  <UserX className="size-4" /> No-show
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-destructive hover:text-destructive"
                  onClick={() => onCancel(r)}
                >
                  <Ban className="size-4" /> Cancel
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Clock;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}
