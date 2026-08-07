import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { ScrollText } from "lucide-react";
import { pageRows, useAuditPage, useOrgUsers, type AuditListFilter } from "@/features/queries";
import { guardRoute } from "@/lib/permissions";
import { usePaging } from "@/lib/paging";
import { useTimeZone } from "@/lib/use-timezone";
import { resourceLabel, type AuditEvent } from "@/types/api";
import {
  useListQueryState,
  asFacetInts,
  asFacetStrings,
  validateListSearch,
} from "@/lib/list-query-state";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { DataTable } from "@/components/data-table";
import { ListSearchBar, type FacetDef } from "@/components/list-filters";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { AuditDetailSheet } from "@/components/audit/audit-detail-sheet";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

//`startDate`/`endDate` are facet keys rather than local state so the window travels in the
//URL with the other two filters — an audit finding is something you paste to someone else.
const FACET_KEYS = ["entityType", "actorOrgUserId", "startDate", "endDate", "event"] as const;

export const Route = createFileRoute("/_authed/audit-logs")({
  //Admin-only, matching `GET /audit` on the server. Guarding the route as well as the nav
  //means a pasted URL bounces rather than rendering a table that can only 403.
  beforeLoad: guardRoute("/audit-logs"),
  validateSearch: (s) => validateListSearch(s, [...FACET_KEYS]),
  component: AuditLogsPage,
});

/** The entity types the server will accept — anything else is a 400, not an empty list. */
const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "reservation", label: "Reservations" },
  { value: "invoice", label: "Invoices" },
  { value: "orgUser", label: "Members" },
  { value: "resource", label: "Aircraft & facilities" },
  { value: "squawk", label: "Squawks" },
  { value: "inspection", label: "Inspections" },
  { value: "document", label: "Documents" },
  { value: "enrollment", label: "Training" },
  { value: "membership", label: "Memberships" },
  { value: "joinRequest", label: "Join requests" },
  { value: "organization", label: "Settings" },
  { value: "apiKey", label: "API keys" },
];

const ENTITY_LABEL = new Map(ENTITY_TYPES.map((e) => [e.value, e.label]));

/**
 * How an action reads as a title. The stored `action` is a stable dotted string that must
 * never be renamed; this is the display layer that lets it stay that way.
 *
 * An unmapped action falls back to its own verb rather than to "Unknown" — a new event type
 * shipped by the server should show up here as something readable on day one, not disappear.
 */
function actionLabel(action: string): string {
  const known: Record<string, string> = {
    "reservation.created": "Booked",
    "reservation.rescheduled": "Rescheduled",
    "reservation.updated": "Edited",
    "reservation.cancelled": "Cancelled",
    "reservation.rampedOut": "Ramped out",
    "reservation.rampedIn": "Ramped in",
    "reservation.reviewConfirmed": "Signed off",
    "reservation.invoiced": "Invoiced",
    "invoice.created": "Invoice raised",
    "invoice.voided": "Invoice voided",
    "invoice.markedPaid": "Marked paid",
    "orgUser.rolesChanged": "Roles changed",
    "orgUser.grounded": "Member grounded",
    "orgUser.ungrounded": "Member ungrounded",
    "orgUser.resourceApproved": "Checked out",
    "orgUser.resourceUnapproved": "Checkout removed",
    "orgUser.contactUpdated": "Contact details changed",
    "orgUser.emergencyContactAdded": "Emergency contact added",
    "orgUser.emergencyContactUpdated": "Emergency contact changed",
    "orgUser.emergencyContactRemoved": "Emergency contact removed",
    "joinRequest.accepted": "Join request accepted",
    "joinRequest.declined": "Join request declined",
    "resource.grounded": "Aircraft grounded",
    "resource.ungrounded": "Returned to service",
    "squawk.created": "Squawk filed",
    "squawk.resolved": "Squawk resolved",
    "squawk.verified": "Squawk verified",

    //Documents
    "document.uploaded": "Document uploaded",
    "document.replaced": "Document replaced",
    "document.deleted": "Document deleted",
    "document.expiryChanged": "Document expiry changed",

    //Inspections
    "inspection.created": "Inspection scheduled",
    "inspection.completed": "Inspection signed off",
    "inspection.deleted": "Inspection removed",

    //Fleet
    "resource.created": "Added to fleet",
    "resource.updated": "Aircraft edited",
    "resource.meterCorrected": "Meters corrected",
    "resource.rateChanged": "Rate changed",
    "resource.archived": "Retired from fleet",
    "resource.unarchived": "Returned to fleet",

    //Training records
    "enrollment.created": "Enrolled",
    "enrollment.removed": "Enrollment ended",
    "enrollment.lessonGraded": "Lesson graded",
    "enrollment.lessonGradeChanged": "Grade amended",
    "enrollment.stageCheckRecorded": "Stage check recorded",
    "enrollment.syllabusChanged": "Syllabus changed",

    //Reservations, the money-shaped half
    "reservation.closedOut": "Closed out",
    "reservation.metersEntered": "Meters entered",
    "reservation.metersCorrected": "Meters corrected",
    "reservation.splitChanged": "Cost split changed",
    "reservation.personnelChanged": "Crew changed",

    //Invoices
    "invoice.refunded": "Refunded",
    "invoice.lineEdited": "Line edited",
    "invoice.discountApplied": "Discount applied",
    "invoice.sent": "Invoice sent",

    //Memberships
    "membership.created": "Membership started",
    "membership.planChanged": "Plan changed",
    "membership.cancelled": "Membership cancelled",
    "membership.duesCharged": "Dues billed",
    "membership.duesWaived": "Dues waived",

    //Org configuration
    "organization.bookingPolicyChanged": "Booking policy changed",
    "organization.preferencesChanged": "Preferences changed",
    "organization.timeZoneChanged": "Time zone changed",

    //Access
    "apiKey.created": "API key created",
    "apiKey.revoked": "API key revoked",
    "orgUser.invited": "Invitation sent",
    "orgUser.removed": "Removed from organization",
    "orgUser.archived": "Archived",
    "orgUser.unarchived": "Unarchived",
    "orgUser.endorsementAdded": "Endorsement given",
    "orgUser.endorsementRemoved": "Endorsement removed",
  };
  if (known[action]) return known[action];
  const verb = action.split(".").pop() ?? action;
  return verb.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/**
 * The stored summary, or null when it adds nothing.
 *
 * A summary has to stand on its own for an API consumer, so an event with no names to
 * work with stores the plain sentence — "Checkout removed". Printed under a title that
 * already says "Checkout removed", that's a line of noise, and the About column is
 * already showing the member and the aircraft.
 */
function detailLine(e: AuditEvent): string | null {
  if (!e.summary) return null;
  const title = actionLabel(e.action);
  return e.summary.trim().toLowerCase() === title.toLowerCase() ? null : e.summary;
}

/**
 * Which actions read as red.
 *
 * Deliberately conservative: red is for something being taken away or undone, not for
 * anything merely consequential. `meterCorrected` and `lessonGradeChanged` are two of the
 * most serious entries in the feed and are NOT red — they are ordinary corrections far more
 * often than they are anything else, and colouring every correction as an alarm is how a
 * page teaches people to ignore its colours.
 */
function isDestructive(action: string): boolean {
  return /\.(cancelled|voided|declined|grounded|unapproved|deleted|removed|revoked|archived|refunded)$/.test(
    action
  );
}

/** How far back the feed looks when nobody has picked a range. */
const DEFAULT_WINDOW_DAYS = 30;

function startOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

function endOfDayIso(d: Date): string {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

function asDate(v: unknown): Date | undefined {
  if (typeof v !== "string" || !v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function personName(p: AuditEvent["actor"]): string | null {
  return p?.user?.name ?? p?.user?.email ?? null;
}

/**
 * Who or what the event was about — "Sam Reyes · N172TS".
 *
 * Read off the `subject` and `resource` relations rather than out of the summary text, so
 * it stays correct after a rename and is there even for the events whose summary is a bare
 * verb. On a phone this is the only place the subject appears at all.
 */
function subjectLine(e: AuditEvent): string | null {
  const parts = [personName(e.subject), e.resource ? resourceLabel(e.resource).name : null].filter(
    Boolean
  );
  return parts.length ? parts.join(" · ") : null;
}

/** "from the console" — only worth saying when we actually know. */
function sourceLabel(source: string | null): string | null {
  switch (source) {
    case "web":
      return "console";
    case "ios":
      return "app";
    case "api":
      return "API";
    default:
      return null;
  }
}

function AuditLogsPage() {
  const tz = useTimeZone();
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { facets, setFacets } = useListQueryState({
    storageKey: "audit-logs",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [...FACET_KEYS],
  });

  const peopleQ = useOrgUsers();

  const entityType = asFacetStrings(facets.entityType)[0];
  const actorOrgUserId = asFacetInts(facets.actorOrgUserId)?.[0];
  //Which row is open, in the URL beside the filters so an audit finding is one paste — the
  //whole reason this page keeps its state there. It is deliberately NOT part of `filter`
  //below: opening a row must not re-query the page it was opened from.
  const openEventId = asFacetInts(facets.event)?.[0] ?? null;
  //Defaults to the last 30 days rather than to all time: an audit log's first page is almost
  //always "what happened recently", and an unbounded default would count every row in the
  //org to draw twenty-five.
  //
  //The picker stores calendar dates; the API wants instants. The end is pushed to the end of
  //its day, or a range ending "today" would exclude everything that happened today.
  //
  //Reduced to strings here rather than inside the memo so the dependency list holds plain
  //values — two Dates parsed from the same URL are never `===`, and would re-fetch forever.
  const startDate = startOfDayIso(
    asDate(facets.startDate) ?? new Date(Date.now() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  );
  const endIso = asDate(facets.endDate);
  const endDate = endIso ? endOfDayIso(endIso) : undefined;

  const filter: AuditListFilter = React.useMemo(
    () => ({ entityType, actorOrgUserId, startDate, endDate }),
    [entityType, actorOrgUserId, startDate, endDate]
  );

  //Any filter change sends the table back to page one — otherwise you narrow to one person
  //while on page 7 and stare at an empty table that says there are 400 results.
  const paging = usePaging({ resetKey: JSON.stringify(filter) });
  const q = useAuditPage(filter, paging);
  const { rows, total } = pageRows<AuditEvent>(q);

  //Resolved against the rows on screen rather than fetched on its own. Unlike an invoice,
  //an audit event has no endpoint that returns one by id — and it needs none: the panel is
  //opened by clicking a row, so the row is always in hand. A stale `?event=` from a pasted
  //link whose filters no longer match simply opens nothing, which is the honest outcome.
  const openEvent = React.useMemo(
    () => rows.find((r) => r.id === openEventId) ?? null,
    [rows, openEventId]
  );

  //↑/↓ through the page while the panel is docked. Clamped rather than wrapping: running
  //off the end of a page and reappearing at the top reads as a bug.
  const step = React.useCallback(
    (delta: -1 | 1) => {
      const i = rows.findIndex((r) => r.id === openEventId);
      if (i < 0) return;
      const next = rows[i + delta];
      if (next) setFacets({ ...facets, event: [String(next.id)] });
    },
    [rows, openEventId, facets, setFacets]
  );

  const columns = React.useMemo<ColumnDef<AuditEvent, unknown>[]>(
    () => [
      {
        id: "when",
        //Every column but Action is pinned. Left to the browser, each one sizes to the
        //widest cell on the CURRENT page, so applying a filter re-laid out the whole table
        //— the same five columns in visibly different places, which reads as a different
        //screen rather than as the same one showing fewer rows.
        meta: { width: "12rem" },
        header: "When",
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-muted-foreground">
            {tz.date(row.original.createdAt, "short")} {tz.time(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "action",
        //The one column deliberately left to flex: it holds the summary, it is what a
        //reader is here for, and it should spend whatever width the others do not.
        header: "Action",
        cell: ({ row }) => {
          const e = row.original;
          const detail = detailLine(e);
          return (
            <div className="min-w-0">
              <div
                className={cn(
                  "font-medium",
                  isDestructive(e.action) && "text-destructive"
                )}
              >
                {actionLabel(e.action)}
              </div>
              {detail && <div className="truncate text-xs text-muted-foreground">{detail}</div>}
            </div>
          );
        },
      },
      {
        id: "who",
        meta: { width: "13rem" },
        header: () => (
          <span className="inline-flex items-center gap-1.5">
            Who
            <DocsHint topic="audit-who" />
          </span>
        ),
        cell: ({ row }) => {
          const e = row.original;
          //A null actor is an automated event, not a missing one. Saying "AerScheduler"
          //is the truthful reading of a cron sweep or a webhook.
          const who = personName(e.actor) ?? "AerScheduler";
          const via = sourceLabel(e.source);
          return (
            <div className="min-w-0">
              <div className="truncate">{who}</div>
              {via && <div className="text-xs text-muted-foreground">via {via}</div>}
            </div>
          );
        },
      },
      {
        id: "subject",
        meta: { width: "14rem" },
        header: "About",
        cell: ({ row }) => (
          <span className="text-muted-foreground">{subjectLine(row.original) ?? "—"}</span>
        ),
      },
      {
        id: "type",
        meta: { width: "12rem" },
        header: "Type",
        cell: ({ row }) => (
          <Badge variant="secondary" className="whitespace-nowrap">
            {ENTITY_LABEL.get(row.original.entityType) ?? row.original.entityType}
          </Badge>
        ),
      },
    ],
    [tz]
  );

  const facetDefs = React.useMemo<FacetDef[]>(
    () => [
      {
        kind: "select",
        key: "entityType",
        label: "Type",
        allLabel: "All types",
        options: ENTITY_TYPES.map((e) => ({ value: e.value, label: e.label })),
      },
      {
        kind: "select",
        key: "actorOrgUserId",
        label: "Person",
        allLabel: "Anyone",
        //Everyone in the org, not just those who happen to appear on this page — the
        //question is "what did this person do", which you ask before you can see them.
        options: (peopleQ.data ?? [])
          .map((ou) => ({
            value: String(ou.id),
            label: ou.user?.name ?? ou.user?.email ?? `#${ou.id}`,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      { kind: "dateRange", key: "dateRange", label: "Date range" },
    ],
    [peopleQ.data]
  );

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Audit Logs"
          subtitle={
            q.data ? `${total.toLocaleString()} event${total === 1 ? "" : "s"}` : "Who changed what, and when."
          }
        />
        <ListSearchBar
          facets={facetDefs}
          filterValues={facets}
          onFilterChange={setFacets}
          aria-label="Filter audit logs"
        />
      </TableView.Header>

      {q.isPending ? (
        <Card className="min-h-0 flex-1 overflow-hidden">
          <TableSkeleton rows={8} cols={5} />
        </Card>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <DataTable<AuditEvent>
          fill
          columns={columns}
          data={rows}
          paging={paging}
          total={total}
          onRowClick={(e) => setFacets({ ...facets, event: [String(e.id)] })}
          isRowSelected={(e) => e.id === openEventId}
          //The empty state lives in the table's own empty slot rather than beside it:
          //this page always has a date window, so "nothing at all" and "nothing matching"
          //are the same screen, and rendering both would show a message under real rows.
          emptyMessage={
            <EmptyState
              icon={ScrollText}
              title="Nothing in this window"
              body="Auditing records what people do from the moment it was switched on — widen the dates, or clear the filters."
            />
          }
          mobileCard={(e) => {
            //`detail ?? subject` rather than both: the summary, when it says anything beyond
            //the title, already names the people involved, so printing the subject under it
            //repeats them. Without a summary the subject is the only thing identifying the row.
            const detail = detailLine(e) ?? subjectLine(e);
            return (
              <div className="space-y-1">
                <div className={cn("font-medium", isDestructive(e.action) && "text-destructive")}>
                  {actionLabel(e.action)}
                </div>
                {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
                <div className="text-xs text-muted-foreground tabular-nums">
                  {tz.date(e.createdAt, "short")} {tz.time(e.createdAt)} ·{" "}
                  {personName(e.actor) ?? "AerScheduler"}
                </div>
              </div>
            );
          }}
        />
      )}

      <AuditDetailSheet
        event={openEvent}
        open={openEvent != null}
        onOpenChange={(o) => {
          if (!o) setFacets({ ...facets, event: [] });
        }}
        onStep={step}
        actionLabel={actionLabel}
        entityLabel={(t) => ENTITY_LABEL.get(t) ?? t}
        isDestructive={isDestructive}
      />
    </TableView>
  );
}
