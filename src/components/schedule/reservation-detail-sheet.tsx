import { format, parseISO } from "date-fns";
import { Ban, Clock, FileText, MapPin, Pencil, Plane, Users } from "lucide-react";
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
import { WeatherBadge } from "@/components/weather-badge";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DOT_CLASS, personnelNames, resourceIcon, typeLabel } from "./meta";
import { CloseOutSection } from "./close-out-section";
import { canCancelReservation, canEditReservation } from "./close-out";

/**
 * Format an instant in the reservation's OWN timezone so the clock value agrees
 * with the `timeZoneName` label shown next to it. (Single-timezone operations
 * see no change; it only matters when the viewer's browser is in a different
 * zone than where the flight is scheduled.) Falls back to local on a bad zone.
 */
function timeInZone(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: tz,
    }).format(parseISO(iso));
  } catch {
    return format(parseISO(iso), "h:mm a");
  }
}

/** Slide-over with the full reservation record + destructive actions. */
export function ReservationDetailSheet({
  reservation,
  open,
  onOpenChange,
  onCancel,
  onEdit,
}: {
  reservation: Reservation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: (r: Reservation) => void;
  /** Omitted on surfaces with no edit form mounted. */
  onEdit?: (r: Reservation) => void;
}) {
  const { roles, orgUserId } = useAuth();
  const r = reservation;
  const canCancel = r ? canCancelReservation(r, roles, orgUserId) : false;
  const canEdit = r != null && onEdit != null && canEditReservation(r, roles, orgUserId);
  const res = r?.resource ? resourceLabel(r.resource) : null;
  const ResourceIcon = r?.resource ? resourceIcon(r.resource) : Plane;
  const names = r ? personnelNames(r) : [];
  // `reservation.location` is hydrated (name + address + geocoded coordinates);
  // `reservation.resource.location` is only a { id } stub. The weather lookup needs
  // the former — see the Location field below.
  // Typed narrowly here rather than in types/api.ts, which doesn't declare the
  // reservation's location relation. WeatherBadge narrows the address itself.
  const reservationLocation =
    (r as unknown as { location?: { name?: string } | null } | null)?.location ?? null;

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
                  {timeInZone(r.start, r.timeZoneName)} – {timeInZone(r.end, r.timeZoneName)}
                </span>
                <span className="ml-2 text-muted-foreground">{r.timeZoneName}</span>
              </Field>

              <Field icon={ResourceIcon} label="Resource">
                {res ? (
                  <span>
                    <span className="font-medium">{res.name}</span>
                    <span className="ml-2 text-muted-foreground">{res.kind}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </Field>

              {/* The RESERVATION's own location, not the resource's. The API returns
                  `resource.location` as a bare { id } stub, so reading it here rendered
                  no Location row and gave the weather badge no coordinates to work
                  with. `reservation.location` is the fully hydrated one (name + address
                  + geocoded coordinates). Fall back to the stub only for its name. */}
              {(reservationLocation?.name ?? r.resource?.location?.name) && (
                <Field icon={MapPin} label="Location">
                  {reservationLocation?.name ?? r.resource?.location?.name}
                </Field>
              )}

              {/* Renders nothing at all — no row, no spinner — unless the location is
                  geocoded AND a lookup came back. Its own markup mirrors `Field` below
                  so it can hide the whole row rather than leave an empty label. */}
              <WeatherBadge
                variant="detail"
                location={reservationLocation}
                start={r.start}
                timeZone={r.timeZoneName}
              />

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

            {(canEdit || canCancel) && (
              <SheetFooter>
                {canEdit && (
                  <Button variant="outline" className="w-full" onClick={() => onEdit(r)}>
                    <Pencil className="size-4" /> Edit reservation
                  </Button>
                )}
                {canCancel && (
                  <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => onCancel(r)}
                  >
                    <Ban className="size-4" /> Cancel reservation
                  </Button>
                )}
              </SheetFooter>
            )}
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
