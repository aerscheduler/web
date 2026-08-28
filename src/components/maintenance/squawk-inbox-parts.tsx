import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileText,
  PlaneTakeoff,
  User,
} from "lucide-react";
import type { Squawk } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { cn, formatDate } from "@/lib/utils";
import { SheetDetailField } from "@/components/sheet-detail-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STAMP = "MMM d, yyyy 'at' h:mm a";

/** The one badge that says where a squawk stands, worst first. Shared by row and record. */
export function SquawkStatusBadge({ squawk }: { squawk: Squawk }) {
  if (squawk.resolvedAt) return <Badge variant="success">Resolved</Badge>;
  if (squawk.verifiedAt) return <Badge>Verified</Badge>;
  if (squawk.grounding) return <Badge variant="danger">Grounding</Badge>;
  return <Badge variant="warning">Open</Badge>;
}

/**
 * One squawk as a row in the inbox list.
 *
 * Deliberately thinner than `SquawkCard`, which was built for a full-width board and puts
 * its Resolve button on every row. In a two-pane layout the row's whole job is to let
 * somebody choose what to read; the acting happens in the record beside it, once, rather
 * than 25 times down the list. So this carries the four things you triage on, what broke,
 * which aeroplane, where it stands, and when, and nothing else.
 *
 * No interactive children. The row IS the button (see `InboxView`), and a control nested
 * inside it would be unreachable by keyboard and invalid inside `role="option"`.
 */
export function SquawkRow({ squawk }: { squawk: Squawk }) {
  const aircraft = squawk.resource ? resourceLabel(squawk.resource).name : null;
  const stamp = squawk.resolvedAt ?? squawk.reportedAt ?? squawk.createdAt;

  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">
          {squawk.title || "Untitled squawk"}
        </span>
        <SquawkStatusBadge squawk={squawk} />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {aircraft && (
          <>
            <PlaneTakeoff className="size-3 shrink-0" />
            <span className="truncate font-mono">{aircraft}</span>
            {stamp && (
              <span aria-hidden className="text-muted-foreground/40">
                ·
              </span>
            )}
          </>
        )}
        {stamp && (
          <span className="shrink-0 tabular-nums">{format(new Date(stamp), "MMM d")}</span>
        )}
      </div>
      {squawk.description && (
        <p className="truncate text-xs text-muted-foreground/80">{squawk.description}</p>
      )}
    </div>
  );
}

/**
 * The full write-up, filling the record pane.
 *
 * Same facts the old right-hand drawer showed, laid out for a pane that is most of the
 * window rather than a 26rem slice of it: the description gets room to be read without
 * wrapping every four words, and the stamps sit in a grid beside it instead of stacked
 * down a column.
 *
 * Verify and Resolve are two acts against two columns, so they stay two buttons. Verify
 * disappears once the squawk carries either stamp: after it is resolved there is nothing
 * left to confirm, and stamping it then records two steps in an order that never happened.
 */
export function SquawkRecord({
  squawk,
  onResolve,
  onVerify,
  className,
}: {
  squawk: Squawk;
  /** Omitted when the viewer cannot sign squawks off (a dispatcher reads this board). */
  onResolve?: (squawk: Squawk) => void;
  onVerify?: (squawk: Squawk) => void;
  className?: string;
}) {
  const aircraft = squawk.resource ? resourceLabel(squawk.resource).name : null;
  const reported = formatDate(squawk.reportedAt ?? squawk.createdAt, STAMP, "");
  const resolved = formatDate(squawk.resolvedAt, STAMP, "");
  const verified = formatDate(squawk.verifiedAt, STAMP, "");
  const isOpen = !squawk.resolvedAt;
  const showVerify = onVerify != null && !squawk.verifiedAt && !squawk.resolvedAt;

  return (
    <article data-doc-shot="squawk-record" className={cn("min-w-0 space-y-5", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {squawk.title || "Untitled squawk"}
            </h2>
            <SquawkStatusBadge squawk={squawk} />
          </div>
          {aircraft && (
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">{aircraft}</p>
          )}
        </div>
        {(showVerify || (isOpen && onResolve)) && (
          <div className="flex shrink-0 gap-2">
            {showVerify && (
              <Button variant="outline" onClick={() => onVerify(squawk)}>
                <ClipboardCheck className="size-4" /> Verify
              </Button>
            )}
            {isOpen && onResolve && (
              <Button onClick={() => onResolve(squawk)}>
                <Check className="size-4" /> Resolve squawk
              </Button>
            )}
          </div>
        )}
      </header>

      {squawk.grounding && !squawk.resolvedAt && (
        <p className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            This squawk grounded the aircraft. Resolving it doesn&rsquo;t return it to service
            on its own.
          </span>
        </p>
      )}

      <SheetDetailField icon={FileText} label="Description">
        {squawk.description ? (
          // `max-w-prose`: the pane can be 1200px wide on a big monitor and a description
          // set to the full width of that is genuinely hard to read back to the next line.
          <p className="max-w-prose whitespace-pre-wrap">{squawk.description}</p>
        ) : (
          <span className="text-muted-foreground">No description</span>
        )}
      </SheetDetailField>

      {/* Two columns once there is room, which there is here and never was in the drawer. */}
      <div className="grid gap-5 sm:grid-cols-2 lg:max-w-3xl">
        {aircraft && (
          <SheetDetailField icon={PlaneTakeoff} label="Aircraft">
            <span className="font-medium">{aircraft}</span>
          </SheetDetailField>
        )}
        <SheetDetailField icon={User} label="Reported by">
          {squawk.reportedBy?.user?.name ?? (
            <span className="text-muted-foreground">Unknown</span>
          )}
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
      </div>

      {squawk.notes && (
        <SheetDetailField icon={FileText} label="What was done">
          <p className="max-w-prose whitespace-pre-wrap">{squawk.notes}</p>
        </SheetDetailField>
      )}

      {/* Still worth offering: the record page is the thing you bookmark or send someone. */}
      <Link
        to="/maintenance/squawks/$squawkId"
        params={{ squawkId: String(squawk.id) }}
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Open the full write-up
        <ArrowUpRight className="size-3.5" />
      </Link>
    </article>
  );
}
