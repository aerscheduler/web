import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  MessageSquare,
  PlaneTakeoff,
  User,
} from "lucide-react";
import type { Squawk } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useSquawk } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { SquawkNotes } from "@/components/maintenance/squawk-notes";
import { DetailPanel } from "@/components/detail-panel";
import { SheetDetailField } from "@/components/sheet-detail-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STAMP = "MMM d, yyyy 'at' h:mm a";

/**
 * Squawk detail, same docked/sheet chrome as invoices and bookings.
 *
 * The list card already shows the gist; this is the full write-up plus who reported it and
 * when it was signed off. Both stamps stay deliberate actions in the footer, not something
 * you do by opening the panel.
 *
 * Verify and Resolve are two different acts against two different columns, so they are two
 * buttons. Verify disappears once the squawk carries either stamp: after it is resolved
 * there is nothing left to confirm, and stamping it then records the two steps in an order
 * that never happened.
 */
export function SquawkDetailSheet({
  squawk,
  open,
  onOpenChange,
  onResolve,
  onVerify,
  onStep,
}: {
  squawk: Squawk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Open the resolve modal. Omitted when the viewer can't sign squawks off. */
  onResolve?: (squawk: Squawk) => void;
  /** Open the verify modal. Omitted for the same viewers as `onResolve`. */
  onVerify?: (squawk: Squawk) => void;
  onStep?: (delta: -1 | 1) => void;
}) {
  const s = squawk;
  const { roles } = useAuth();

  //The list row this panel is opened from carries no comments: the thread only comes back
  //on the single-squawk read. Fetched here rather than widened onto the list, because a
  //board of forty squawks does not need forty threads to draw one panel. Keyed
  //["squawks", id], the same entry the record page uses, so opening the panel warms it.
  const full = useSquawk(open && s ? s.id : null);
  const comments = full.data?.comments;

  const aircraft = s?.resource ? resourceLabel(s.resource).name : null;
  const reported = formatDate(s?.reportedAt ?? s?.createdAt, STAMP, "");
  const resolved = formatDate(s?.resolvedAt, STAMP, "");
  const verified = formatDate(s?.verifiedAt, STAMP, "");
  const openSquawk = s != null && !s.resolvedAt;
  const showVerify = s != null && onVerify != null && !s.verifiedAt && !s.resolvedAt;

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
          ) : s.verifiedAt ? (
            <Badge>Verified</Badge>
          ) : s.grounding ? (
            <Badge variant="danger">Grounding</Badge>
          ) : (
            <Badge variant="warning">Open</Badge>
          )
        ) : undefined
      }
      footer={
        s && (showVerify || (openSquawk && onResolve)) ? (
          <div className="flex w-full gap-2">
            {showVerify && (
              <Button variant="outline" className="flex-1" onClick={() => onVerify(s)}>
                <ClipboardCheck className="size-4" /> Verify
              </Button>
            )}
            {openSquawk && onResolve && (
              <Button className="flex-1" onClick={() => onResolve(s)}>
                <Check className="size-4" /> Resolve squawk
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {s && (
        <div data-doc-shot="squawk-detail-panel" className="space-y-5 pt-4">
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
            {s.reportedBy?.user?.name ?? <span className="text-muted-foreground">Unknown</span>}
          </SheetDetailField>

          {reported && (
            <SheetDetailField icon={CalendarClock} label="Reported">
              <span className="tabular-nums">{reported}</span>
            </SheetDetailField>
          )}

          {verified && (
            <SheetDetailField icon={ClipboardCheck} label="Verified">
              <span className="tabular-nums">{verified}</span>
            </SheetDetailField>
          )}

          {resolved && (
            <SheetDetailField icon={Check} label="Resolved">
              <span className="tabular-nums">{resolved}</span>
            </SheetDetailField>
          )}

          <SheetDetailField icon={MessageSquare} label="Notes">
            <SquawkNotes
              squawkId={s.id}
              comments={comments}
              canWrite={canResolveSquawk(roles)}
              loading={full.isLoading}
              compact
            />
          </SheetDetailField>

          {/* The panel is a peek at a row in a list. The record page is the thing you can
              bookmark, link a colleague to, and land on from a notification. */}
          <Link
            to="/maintenance/squawks/$squawkId"
            params={{ squawkId: String(s.id) }}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open the full write-up
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      )}
    </DetailPanel>
  );
}
