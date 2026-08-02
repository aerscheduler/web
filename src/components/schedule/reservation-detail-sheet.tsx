import { Ban, Clock, FileText, MapPin, Pencil, Plane, Users } from "lucide-react";
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
import { SheetDetailField } from "@/components/sheet-detail-field";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DOT_CLASS, personnelNames, resourceIcon, typeLabel } from "./meta";
import { CloseOutSection } from "./close-out-section";
import { ReservationAudit } from "./reservation-audit";
import { canCancelReservation, canEditReservation } from "./close-out";
import { formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";

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
  const tz = useTimeZone(r?.location);
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
              <SheetDescription>{tz.date(r.start, "long")}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              {/* Airport time, and only says so when the reader is somewhere else. The old
                  version formatted with r.timeZoneName — the zone of the DEVICE THAT BOOKED
                  IT — and printed the raw "America/Boise" next to every booking whether or
                  not it told the reader anything. */}
              <SheetDetailField icon={Clock} label="Time">
                <span className="tabular-nums">
                  {tz.time(r.start)} – {tz.time(r.end)}
                </span>
                {tz.differs(r.start) && (
                  <span className="ml-2 text-muted-foreground">
                    {tz.label(r.start)} · {formatTimeInZone(r.start, tz.viewerZone)} your time
                  </span>
                )}
              </SheetDetailField>

              <SheetDetailField icon={ResourceIcon} label="Resource">
                {res ? (
                  <span>
                    <span className="font-medium">{res.name}</span>
                    <span className="ml-2 text-muted-foreground">{res.kind}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Unassigned</span>
                )}
              </SheetDetailField>

              {(reservationLocation?.name ?? r.resource?.location?.name) && (
                <SheetDetailField icon={MapPin} label="Location">
                  {reservationLocation?.name ?? r.resource?.location?.name}
                </SheetDetailField>
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

              <SheetDetailField icon={Users} label="Personnel">
                {names.length > 0 ? (
                  <ul className="space-y-0.5">
                    {names.map((n, i) => (
                      <li key={`${n}-${i}`}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">No one assigned</span>
                )}
              </SheetDetailField>

              {r.notes && (
                <SheetDetailField icon={FileText} label="Notes">
                  <p className="whitespace-pre-wrap text-muted-foreground">{r.notes}</p>
                </SheetDetailField>
              )}

              <CloseOutSection reservation={r} />

              {/* Last, and always rendered — including on a cancelled booking, where
                  CloseOutSection bails out entirely and this is the only thing left
                  that explains what happened to it. */}
              <ReservationAudit reservation={r} />
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
