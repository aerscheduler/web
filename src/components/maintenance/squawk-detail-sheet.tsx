import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, Check, FileText, PlaneTakeoff, User } from "lucide-react";
import type { Squawk } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { SheetDetailField } from "@/components/sheet-detail-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function fmt(iso: string | null | undefined) {
  return iso ? format(parseISO(iso), "MMM d, yyyy 'at' h:mm a") : null;
}

/**
 * Squawk detail — same docked/sheet chrome as invoices and bookings.
 *
 * The list card already shows the gist; this is the full write-up plus who
 * reported it and when it was signed off. Resolve stays a deliberate action
 * (footer), not the act of opening the panel.
 */
export function SquawkDetailSheet({
  squawk,
  open,
  onOpenChange,
  onResolve,
  onStep,
}: {
  squawk: Squawk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the resolve modal. Omitted when the viewer can't sign squawks off. */
  onResolve?: (squawk: Squawk) => void;
  onStep?: (delta: -1 | 1) => void;
}) {
  const s = squawk;
  const aircraft = s?.resource ? resourceLabel(s.resource).name : null;
  const reported = fmt(s?.createdAt);
  const resolved = fmt(s?.resolvedAt);
  const verified = fmt(s?.verifiedAt);
  const openSquawk = s != null && !s.resolvedAt;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={s?.title || "Untitled squawk"}
      description={aircraft ?? undefined}
      badge={
        s ? (
          s.resolvedAt ? (
            <Badge variant="success">Resolved</Badge>
          ) : s.grounding ? (
            <Badge variant="danger">Grounding</Badge>
          ) : (
            <Badge variant="warning">Open</Badge>
          )
        ) : undefined
      }
      footer={
        openSquawk && onResolve ? (
          <Button className="w-full" onClick={() => onResolve(s)}>
            <Check className="size-4" /> Resolve squawk
          </Button>
        ) : undefined
      }
    >
      {s && (
        <div className="space-y-5 pt-4">
          {s.grounding && !s.resolvedAt && (
            <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                This squawk grounded the aircraft. Resolving it doesn&rsquo;t return it to
                service on its own.
              </span>
            </p>
          )}

          {s.description ? (
            <SheetDetailField icon={FileText} label="Description">
              <p className="whitespace-pre-wrap">{s.description}</p>
            </SheetDetailField>
          ) : (
            <SheetDetailField icon={FileText} label="Description">
              <span className="text-muted-foreground">No description</span>
            </SheetDetailField>
          )}

          {aircraft && (
            <SheetDetailField icon={PlaneTakeoff} label="Aircraft">
              <span className="font-medium">{aircraft}</span>
            </SheetDetailField>
          )}

          <SheetDetailField icon={User} label="Reported by">
            {s.reportedBy?.user?.name ?? (
              <span className="text-muted-foreground">—</span>
            )}
          </SheetDetailField>

          {reported && (
            <SheetDetailField icon={CalendarClock} label="Reported">
              <span className="tabular-nums">{reported}</span>
            </SheetDetailField>
          )}

          {resolved && (
            <SheetDetailField icon={Check} label="Resolved">
              <span className="tabular-nums">{resolved}</span>
            </SheetDetailField>
          )}

          {verified && (
            <SheetDetailField icon={Check} label="Verified">
              <span className="tabular-nums">{verified}</span>
            </SheetDetailField>
          )}
        </div>
      )}
    </DetailPanel>
  );
}
