import { formatDistanceToNowStrict } from "date-fns";
import { Ban, Clock, Hourglass, MapPin, Plane, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { useWithdrawSlotOffer } from "@/features/slot-offers";
import { ApiError } from "@/lib/api";
import type { SlotOffer } from "@/types/slot-offers";
import {
  resourceLabel,
  type Location,
  type ReservationType,
  type Resource,
} from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SheetDetailField } from "@/components/sheet-detail-field";
import { cn } from "@/lib/utils";
import { formatTimeInZone } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
import {
  DOT_CLASS,
  resourceIcon,
  typeLabel,
} from "@/components/schedule/meta";

/**
 * Desk detail for one pending slot offer (calendar hold click).
 * Same shell and field layout as ReservationDetailSheet: a booking that is held,
 * not yet confirmed.
 */
export function SlotOfferDetailSheet({
  offer,
  open,
  onOpenChange,
}: {
  offer: SlotOffer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const withdraw = useWithdrawSlotOffer();
  const o = offer;
  const reservationType = (o?.reservationType ?? "dual") as ReservationType;
  const tz = useTimeZone(
    o ? ({ timeZone: o.timeZoneName } as Location) : null
  );
  const res = o?.resource ? resourceLabel(o.resource as Resource) : null;
  const ResourceIcon = o?.resource ? resourceIcon(o.resource as Resource) : Plane;
  const locationName =
    (o?.resource as Resource | null | undefined)?.location?.name ?? null;

  // Match reservation detail: resource · type. Desk "Demo hold…" titles are seed noise.
  const title =
    o?.purpose === "instructor_confirm"
      ? "Instructor confirm"
      : res
        ? `${res.name} · ${typeLabel(reservationType)}`
        : typeLabel(reservationType);

  const withdrawOffer = async () => {
    if (!o) return;
    try {
      await withdraw.mutateAsync(o.id);
      toast.success("Slot offer withdrawn");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't withdraw this offer");
    }
  };

  const personnel: string[] = [];
  if (o?.offeredTo?.user?.name) {
    personnel.push(
      o.purpose === "instructor_confirm"
        ? `${o.offeredTo.user.name} (confirm)`
        : `${o.offeredTo.user.name} (offered)`
    );
  }
  if (
    o?.instructorOrgUser?.user?.name &&
    o.instructorOrgUser.id !== o.offeredTo?.id
  ) {
    personnel.push(`${o.instructorOrgUser.user.name} (instructor)`);
  }

  return (
    <DetailPanel
      open={open && o != null}
      onOpenChange={onOpenChange}
      title={title}
      description={o ? tz.date(o.start, "long") : undefined}
      badge={
        o ? (
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={cn("size-2.5 rounded-full", DOT_CLASS[reservationType])}
              aria-hidden
            />
            <Badge variant="outline">{typeLabel(reservationType)}</Badge>
            <Badge variant="secondary">Held</Badge>
            <DocsHint topic="pending-slot-offers" />
          </span>
        ) : undefined
      }
      footer={
        o ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full text-destructive hover:text-destructive"
              disabled={withdraw.isPending}
              onClick={() => void withdrawOffer()}
            >
              <Ban className="size-4" /> Withdraw offer
            </Button>
          </div>
        ) : undefined
      }
    >
      {o && (
        <div className="space-y-5 pt-4">
          <SheetDetailField icon={Clock} label="Time">
            <span className="tabular-nums">
              {tz.time(o.start)}{" – "}{/* em-dash-ok: same time range mark as ReservationDetailSheet */}
              {tz.spansDays(o.start, o.end)
                ? `${tz.date(o.end, "short")} at ${tz.time(o.end)}`
                : tz.time(o.end)}
            </span>
            {tz.differs(o.start) && (
              <span className="ml-2 text-muted-foreground">
                {tz.label(o.start)} · {formatTimeInZone(o.start, tz.viewerZone)} your time
              </span>
            )}
          </SheetDetailField>

          <SheetDetailField icon={Hourglass} label="Hold ends">
            <span>
              in {formatDistanceToNowStrict(new Date(o.holdUntil))}
              <span className="ml-2 text-muted-foreground tabular-nums">
                ({tz.time(o.holdUntil)}
                {tz.differs(o.holdUntil) ? ` ${tz.label(o.holdUntil)}` : ""})
              </span>
            </span>
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

          {locationName && (
            <SheetDetailField icon={MapPin} label="Location">
              {locationName}
            </SheetDetailField>
          )}

          <SheetDetailField icon={Users} label="Personnel">
            {personnel.length > 0 ? (
              <ul className="space-y-0.5">
                {personnel.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">No one assigned</span>
            )}
          </SheetDetailField>

          <SheetDetailField icon={RefreshCw} label="Offer">
            <span className="text-muted-foreground">
              {triggerLabel(o.trigger)}
              {o.purpose === "instructor_confirm" ? " · instructor confirm first" : ""}
              {o.createdBy?.user?.name ? ` · by ${o.createdBy.user.name}` : ""}
              {o.notificationDelivery?.anyChannelEnabled === false
                ? " · notifications off for this member"
                : ""}
            </span>
          </SheetDetailField>
        </div>
      )}
    </DetailPanel>
  );
}

function triggerLabel(trigger: SlotOffer["trigger"]): string {
  switch (trigger) {
    case "system":
      return "AerScheduler AI";
    case "desk":
      return "Desk offer";
    case "cancel_recovery":
      return "Cancel recovery";
    default:
      return trigger;
  }
}
