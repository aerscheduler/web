import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, ArrowUpRight, Paperclip, PlaneTakeoff, Plus, ShieldCheck, Wrench } from "lucide-react";
import { useEntityAudit, useMaintenanceReminder } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, canResolveSquawk, guardRoute, isAdmin } from "@/lib/permissions";
import { fromDeciHours, ruleDueLabel, sourceBadge, sourceLabel, warningLabel } from "@/lib/maintenance";
import { formatDate } from "@/lib/utils";
import { resourceLabel, type MaintenanceReminder } from "@/types/api";
import {
  CardEmpty,
  DetailBack,
  DetailCard,
  DetailHeader,
  KeyValue,
  KeyValueList,
  MetaItem,
  RecordNotFound,
  isMissingRecord,
  useDetailTitle,
} from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { TableView } from "@/components/table-view";
import { ListTag } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ResolveReminderModal } from "@/components/maintenance/resolve-reminder-modal";
import { ReminderStepsCard } from "@/components/maintenance/reminder-steps-card";
import { ReminderFilesSheet } from "@/components/maintenance/reminder-files-sheet";
import { WorkOrderFormModal } from "@/components/maintenance/work-order-form-modal";
import { WorkTag, inspectionName } from "@/components/maintenance/inspection-list";
import { NotApplicableCard } from "@/components/maintenance/not-applicable-card";
import {
  HistorySkeleton,
  InspectionCountdown,
  InspectionStateTag,
  JobLink,
  inspectionJobs,
  useInspectionHistory,
  useNextInspection,
} from "@/components/maintenance/inspection-detail";
import { humanizeAction } from "@/components/schedule/reservation-audit";

/**
 * One inspection, in full: where it stands, the rule behind it, its history on this tail, its
 * files, the job carrying it, and what happened to it.
 *
 * Sibling of the maintenance list rather than a child of it (hence `maintenance_`), like the
 * squawk page: Maintenance owns its own scroll container, and nesting would render the whole
 * board underneath. The URL is `/maintenance/inspections/:id`; the app's own route for the
 * same record is `/reminders/:id`, and the console's inbox maps one onto the other
 * (`lib/notification-link`).
 *
 * Who sees it: the same roles as the Maintenance board (staff and technicians), matching
 * `GET /maintenance/reminders/:id`. Signing off is admin and technician, as on the list.
 */
export const Route = createFileRoute("/_authed/maintenance_/inspections/$inspectionId")({
  beforeLoad: guardRoute("/maintenance"),
  component: InspectionDetailPage,
});

function InspectionDetailPage() {
  const { inspectionId: param } = Route.useParams();
  const id = Number.parseInt(param, 10);
  const q = useMaintenanceReminder(Number.isFinite(id) ? id : null);
  const reminder = q.data ?? null;

  // A bad id, another organization's inspection and a deleted one all land here. The server
  // answers 403 for "not yours" rather than 404, so its message would tell somebody who
  // mistyped a link that they are not authorized.
  const missing = !Number.isFinite(id) || isMissingRecord(q.error) || (!q.isLoading && !q.isError && reminder == null);

  if (missing) {
    return (
      <PageFrame>
        <RecordNotFound
          icon={Wrench}
          title="Inspection not found"
          body="That link doesn't point at an inspection in this organization. It may have been removed, which happens when an aircraft stops being tracked on a rule."
          backTo="/maintenance"
          backLabel="Back to Inspections"
        />
      </PageFrame>
    );
  }
  if (q.isLoading) {
    return (
      <PageFrame>
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </PageFrame>
    );
  }
  if (q.isError || !reminder) {
    return (
      <PageFrame>
        <Card>
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      </PageFrame>
    );
  }
  return <InspectionBody reminder={reminder} />;
}

function InspectionBody({ reminder: r }: { reminder: MaintenanceReminder }) {
  const { roles } = useAuth();
  const canManage = canResolveSquawk(roles);
  const seesJobs = canOpenWorkOrders(roles);
  const [signing, setSigning] = useState(false);
  const [files, setFiles] = useState(false);
  const [opening, setOpening] = useState(false);

  const name = inspectionName(r);
  useDetailTitle(name);
  const t = r.template;
  const tail = r.resource ? resourceLabel(r.resource).name : null;
  const source = t ? sourceLabel(t) : null;
  const badge = t ? sourceBadge(t) : null;
  const history = useInspectionHistory(r);
  const next = useNextInspection(r);
  const jobs = inspectionJobs(r);
  const fileCount = r.fileUrls?.length ?? 0;
  const groundsNow = !r.resolvedAt && r.due?.grounds && r.due.status === "overdue";

  return (
    <TableView className="gap-5">
      <TableView.Header>
        <DetailBack to="/maintenance" label="Inspections" />
        <DetailHeader
          media={
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-muted text-muted-foreground">
              <ShieldCheck className="size-5" />
            </span>
          }
          title={name}
          badges={
            <>
              <InspectionStateTag reminder={r} />
              {/* Scheduled or In progress, on the job that has it booked in (Murray spec 5). */}
              <WorkTag work={r.work} />
              {badge ? (
                <span title={source ?? undefined}>
                  <ListTag>{badge}</ListTag>
                </span>
              ) : null}
              {t?.ground ? (
                <span title="Takes the aircraft off the line when it comes due.">
                  <ListTag className="text-warning">Grounds</ListTag>
                </span>
              ) : null}
            </>
          }
          subtitle={t ? ruleDueLabel(t) : undefined}
          meta={
            tail && r.resource ? (
              <MetaItem icon={PlaneTakeoff}>
                <Link
                  to="/aircraft/$resourceId"
                  params={{ resourceId: String(r.resource.id) }}
                  search={{ tab: "maintenance" }}
                  className="font-mono underline-offset-2 hover:underline"
                >
                  {tail}
                </Link>
              </MetaItem>
            ) : undefined
          }
          actions={
            canManage && !r.resolvedAt ? (
              <>
                <Button variant="outline" onClick={() => setFiles(true)}>
                  <Paperclip className="size-4" /> Files{fileCount ? ` (${fileCount})` : ""}
                </Button>
                <Button onClick={() => setSigning(true)}>
                  <ShieldCheck className="size-4" /> Sign off
                </Button>
              </>
            ) : undefined
          }
        />
      </TableView.Header>

      <TableView.Body>
        <div className="grid gap-4 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            {groundsNow && (
              <p className="flex gap-2 rounded-md border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <span>
                  Overdue, and this inspection takes the aircraft off the line. Signing it off returns the aircraft to
                  service unless something else holds it.
                </span>
              </p>
            )}

            <DetailCard title="Where it stands" docShot="inspection-countdown">
              <InspectionCountdown reminder={r} large />
              {r.resolvedAt &&
                (next ? (
                  <Link
                    to="/maintenance/inspections/$inspectionId"
                    params={{ inspectionId: String(next.id) }}
                    className="mt-3 inline-flex items-center gap-1 text-[13px] underline-offset-2 hover:underline"
                  >
                    The next one on this rule is counting. Open it <ArrowUpRight className="size-3.5" />
                  </Link>
                ) : (
                  <p className="mt-3 text-[13px] text-muted-foreground">
                    {t && t.repeat === false
                      ? "This rule doesn't repeat, so nothing comes after it."
                      : "This rule is no longer tracked on this aircraft."}
                  </p>
                ))}
            </DetailCard>

            <DetailCard
              title="History"
              description={
                tail
                  ? `${r.resolvedAt ? "Every other" : "Every earlier"} sign-off of this rule on ${tail}, newest first.`
                  : "Other sign-offs of this rule, newest first."
              }
              docShot="inspection-history"
            >
              {history.isLoading ? (
                <HistorySkeleton />
              ) : history.isError ? (
                <CardEmpty>Couldn't load the history.</CardEmpty>
              ) : history.entries.length === 0 ? (
                <CardEmpty>
                  {r.resolvedAt ? "No other sign-offs of this rule on this aircraft." : "Not signed off on this aircraft before."}
                </CardEmpty>
              ) : (
                <ul className="divide-y divide-border">
                  {history.entries.map(({ reminder: h, record }) => (
                    <li key={h.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">
                          {formatDate(h.completedAt ?? h.resolvedAt, "MMM d, yyyy", "")}
                          {h.completedHours != null ? (
                            <span className="font-normal text-muted-foreground"> · at {fromDeciHours(h.completedHours)}</span>
                          ) : null}
                        </div>
                        <div className="text-[12px] text-muted-foreground">
                          {record
                            ? [
                                record.mechanicName,
                                [record.mechanicCertificateType, record.mechanicCertificateNumber].filter(Boolean).join(" "),
                                record.methodOfCompliance,
                              ]
                                .filter(Boolean)
                                .join(" · ")
                            : h.resolvedBy?.user?.name
                              ? `Signed off by ${h.resolvedBy.user.name}. No compliance record.`
                              : "No compliance record."}
                        </div>
                      </div>
                      {record ? (
                        <Link
                          to="/maintenance"
                          search={{ view: "compliance", open: record.id } as never}
                          className="shrink-0 text-[12px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        >
                          Compliance record
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>

            {!r.resolvedAt && (
            <DetailCard
              title="Files"
              description="Working files for this inspection: photos, a logbook page, a parts receipt. Signing off moves them onto its compliance record."
              action={
                canManage ? (
                  <Button variant="outline" size="sm" onClick={() => setFiles(true)}>
                    <Paperclip className="size-4" /> {fileCount ? "Open files" : "Add a file"}
                  </Button>
                ) : undefined
              }
            >
              <CardEmpty>{fileCount ? `${fileCount} ${fileCount === 1 ? "file" : "files"} attached.` : "No files yet."}</CardEmpty>
            </DetailCard>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            {t && (
              <DetailCard
                title="Rule"
                description={r.resolvedAt ? "The rule as it reads today, not as it was at this sign-off." : "Shared by every aircraft it covers."}
              >
                <KeyValueList>
                  <KeyValue label="Comes due">{ruleDueLabel(t)}</KeyValue>
                  <KeyValue label="Warning">{warningLabel(t)}</KeyValue>
                  <KeyValue label="Grounds the aircraft">{t.ground ? "Yes" : "No"}</KeyValue>
                  {source && (
                    <KeyValue label="Source">
                      {t.sourceUrl ? (
                        <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                          {source}
                        </a>
                      ) : (
                        source
                      )}
                    </KeyValue>
                  )}
                </KeyValueList>
                {t.notes?.trim() ? <p className="mt-3 whitespace-pre-wrap text-[13px] text-muted-foreground">{t.notes.trim()}</p> : null}
                {/* Rules are changed by the same roles that sign off; a dispatcher reads them. */}
                {canManage && (
                  <Link
                    to="/maintenance"
                    search={{ view: "templates", q: name } as never}
                    className="mt-3 inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Change it on Inspection rules <ArrowUpRight className="size-3.5" />
                  </Link>
                )}
              </DetailCard>
            )}

            {/* When it is said, and to whom: the rule's, or this aircraft's own (Murray spec 6). */}
            <ReminderStepsCard reminder={r} canManage={canManage} />

            {/* Whether it applies to this aircraft at all (Murray spec 5). */}
            <NotApplicableCard reminder={r} canManage={canManage} />

            {seesJobs && (
              <DetailCard
                title="Work order"
                description="The job that does this inspection. Signing the inspection off completes its item."
              >
                {jobs.length ? (
                  <ul className="space-y-1.5 text-[13px]">
                    {jobs.map((j) => (
                      <li key={j.id}>
                        <JobLink job={j.workOrder} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-2">
                    <CardEmpty>Not on a work order.</CardEmpty>
                    {!r.resolvedAt && r.resource && (
                      <Button variant="outline" size="sm" onClick={() => setOpening(true)}>
                        <Plus className="size-4" /> Open a work order for {tail ?? "this aircraft"}
                      </Button>
                    )}
                  </div>
                )}
              </DetailCard>
            )}

            {isAdmin(roles) && <InspectionActivity id={r.id} />}
          </div>
        </div>
      </TableView.Body>

      <ResolveReminderModal reminder={signing ? r : null} open={signing} onOpenChange={setSigning} />
      <ReminderFilesSheet reminder={files ? r : null} open={files} onOpenChange={setFiles} />
      {seesJobs && r.resource && (
        <WorkOrderFormModal open={opening} onOpenChange={setOpening} fixedResource={r.resource} />
      )}
    </TableView>
  );
}

/** What each inspection event is called here: "created" is when tracking started. */
const INSPECTION_ACTION: Record<string, string> = {
  "inspection.created": "Opened",
  "inspection.completed": "Signed off",
};

/** The audit trail for this inspection: when it was scheduled and signed off. Admin only. */
function InspectionActivity({ id }: { id: number }) {
  const q = useEntityAudit("inspection", id);
  // `inspection.deleted` is recorded under the RULE's id (deleting a rule ends it on every
  // aircraft), so on an inspection's trail it would be some other rule's deletion that shares
  // this number. Left out here; the aircraft's own audit trail carries it.
  const events = [...(q.data ?? [])]
    .filter((e) => e.action !== "inspection.deleted")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <DetailCard title="Activity">
      {q.isLoading ? (
        <HistorySkeleton />
      ) : q.isError ? (
        <CardEmpty>Couldn't load the activity.</CardEmpty>
      ) : events.length === 0 ? (
        <CardEmpty>Nothing recorded yet.</CardEmpty>
      ) : (
        <ul className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="text-[13px]">
              <div>
                <span className="font-medium">{INSPECTION_ACTION[e.action] ?? humanizeAction(e.action)}</span>
                {e.actor?.user?.name ? <span className="text-muted-foreground"> by {e.actor.user.name}</span> : null}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {formatDate(e.createdAt, "MMM d, yyyy 'at' h:mm a", "")} · {formatDistanceToNowStrict(new Date(e.createdAt), { addSuffix: true })}
              </div>
              {e.summary ? <div className="text-[12px] text-muted-foreground">{e.summary}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5 pb-8">
      <DetailBack to="/maintenance" label="Inspections" />
      {children}
    </div>
  );
}
