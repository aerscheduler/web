/**
 * One inspection, outside a list: the pieces its side panel and its record page share.
 *
 * An inspection is one tail's instance of a rule (a template). Signing it off closes it and
 * creates the next one on the same rule, so "this inspection's history" is the earlier,
 * signed-off inspections of the same rule on the same tail, each with the compliance record
 * written at its sign-off when there was one. An oil change signed off without compliance
 * details has no record, and still belongs in the history.
 *
 * A work order is not this page. A job can carry the inspection as one of its items, and
 * signing the inspection off completes that item (the server refuses to complete it any other
 * way); the inspection links to the job, not the other way round.
 */

import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Gauge,
  Hammer,
  Paperclip,
  PlaneTakeoff,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import type { MaintenanceComplianceRecord, MaintenanceReminder } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { useAircraftComplianceRecords, useMaintenanceReminder, useMaintenanceReminders } from "@/features/queries";
import { fromDeciHours, ruleDueLabel, sourceLabel, warningLabel } from "@/lib/maintenance";
import { WORK_ORDER_STATUS_LABEL, isOpenWorkOrder } from "@/lib/work-orders";
import { formatDate } from "@/lib/utils";
import { DetailPanel } from "@/components/detail-panel";
import { SheetDetailField, SheetDetailFields } from "@/components/sheet-detail-field";
import { ListTag } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DUE_BAND_BY_ID,
  DueFigure,
  DueRail,
  dueBand,
  dueSentence,
  inspectionName,
} from "@/components/maintenance/inspection-list";

/** Where it stands, in the list's own words, or Signed off once it is. */
export function inspectionStateLabel(r: MaintenanceReminder): string {
  if (r.resolvedAt) return "Signed off";
  return DUE_BAND_BY_ID.get(dueBand(r.due))!.label;
}

/** The state as a tag with the band's dot; signed off reads green. */
export function InspectionStateTag({ reminder: r }: { reminder: MaintenanceReminder }) {
  const dot = r.resolvedAt ? "var(--success)" : DUE_BAND_BY_ID.get(dueBand(r.due))!.dot;
  return <ListTag dot={dot}>{inspectionStateLabel(r)}</ListTag>;
}

/** The countdown: the figure, the rail, and the sentence under it. */
export function InspectionCountdown({ reminder: r, large = false }: { reminder: MaintenanceReminder; large?: boolean }) {
  if (r.resolvedAt) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Signed off {formatDate(r.completedAt ?? r.resolvedAt, "MMM d, yyyy", "")}
        {r.completedHours != null ? ` at ${fromDeciHours(r.completedHours)}` : ""}
        {r.resolvedBy?.user?.name ? ` by ${r.resolvedBy.user.name}` : ""}.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div className={large ? "text-2xl" : "text-[15px]"}>
        <DueFigure due={r.due} />
      </div>
      <DueRail due={r.due} />
      <p className="text-[13px] text-muted-foreground">{dueSentence(r.due)}</p>
    </div>
  );
}

/** The work order items that carry this inspection, newest job first. */
export function inspectionJobs(r: MaintenanceReminder) {
  return [...(r.workOrderItems ?? [])].sort((a, b) => b.workOrder.number - a.workOrder.number);
}

export function JobLink({ job }: { job: NonNullable<MaintenanceReminder["workOrderItems"]>[number]["workOrder"] }) {
  return (
    <Link
      to="/maintenance/work-orders/$workOrderId"
      params={{ workOrderId: String(job.id) }}
      className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
    >
      <span className="font-mono">WO-{job.number}</span>
      <span className="text-muted-foreground">{WORK_ORDER_STATUS_LABEL[job.status] ?? job.status}</span>
    </Link>
  );
}

/** A signed-off inspection of the same rule on the same tail, with its compliance record. */
export type HistoryEntry = { reminder: MaintenanceReminder; record: MaintenanceComplianceRecord | null };

/**
 * Earlier sign-offs of this rule on this tail, newest first. Both reads are bounded: one
 * tail's resolved inspections, and one tail's compliance records (up to 250).
 */
export function useInspectionHistory(r: MaintenanceReminder | null) {
  const resourceId = r?.resource?.id ?? null;
  const templateId = r?.template?.id ?? null;
  const resolvedQ = useMaintenanceReminders(
    resourceId != null ? { resourceId, resolved: true } : undefined,
    { enabled: resourceId != null && templateId != null }
  );
  const recordsQ = useAircraftComplianceRecords(resourceId, templateId);
  const byReminder = new Map((recordsQ.data ?? []).filter((c) => c.reminderId != null).map((c) => [c.reminderId!, c]));
  const entries: HistoryEntry[] = (resolvedQ.data ?? [])
    .filter((h) => h.template?.id === templateId && h.id !== r?.id && h.resolvedAt)
    .sort((a, b) => (b.completedAt ?? b.resolvedAt ?? "").localeCompare(a.completedAt ?? a.resolvedAt ?? ""))
    .map((h) => ({ reminder: h, record: byReminder.get(h.id) ?? null }));
  return { entries, isLoading: resolvedQ.isLoading || recordsQ.isLoading, isError: resolvedQ.isError || recordsQ.isError };
}

/**
 * The next inspection on the same rule and tail, for a signed-off one: signing off creates
 * it, and the page for the old one should lead there.
 */
export function useNextInspection(r: MaintenanceReminder | null) {
  const resourceId = r?.resource?.id ?? null;
  const q = useMaintenanceReminders(resourceId != null ? { resourceId, resolved: false } : undefined, {
    enabled: !!r?.resolvedAt && resourceId != null,
  });
  return (q.data ?? []).find((n) => n.template?.id === r?.template?.id && n.id !== r?.id) ?? null;
}

/**
 * The inspection's side panel: a peek from a list row. One footer action, Sign off; the
 * record page is the workspace (history, files, the job, activity).
 */
export function InspectionDetailSheet({
  reminder,
  open,
  onOpenChange,
  onSignOff,
  onFiles,
  onStep,
}: {
  reminder: MaintenanceReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent when the viewer may not sign off. */
  onSignOff?: (r: MaintenanceReminder) => void;
  onFiles?: (r: MaintenanceReminder) => void;
  onStep?: (delta: -1 | 1) => void;
}) {
  // List rows carry neither the jobs nor the file keys: the single read does, keyed
  // ["reminder", id], the same entry the record page uses, so opening the panel warms it.
  const full = useMaintenanceReminder(open && reminder ? reminder.id : null);
  const r = reminder ? { ...reminder, ...(full.data?.id === reminder.id ? full.data : {}) } : null;
  const t = r?.template;
  const tail = r?.resource ? resourceLabel(r.resource).name : null;
  const source = t ? sourceLabel(t) : null;
  const jobs = r ? inspectionJobs(r) : [];
  const hasFiles = r ? (r.hasAttachments ?? (r.fileUrls?.length ?? 0) > 0) : false;
  const liveJob = jobs.find((j) => isOpenWorkOrder(j.workOrder));

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={r ? inspectionName(r) : "Inspection"}
      description={tail ?? undefined}
      badge={r ? <InspectionStateTag reminder={r} /> : undefined}
      footer={
        r && onSignOff && !r.resolvedAt ? (
          <Button className="w-full" onClick={() => onSignOff(r)}>
            <ShieldCheck className="size-4" /> Sign off
          </Button>
        ) : undefined
      }
    >
      {r && (
        <div data-doc-shot="inspection-detail-panel" className="space-y-5 pt-4">
          {r.due?.grounds && r.due.status === "overdue" && !r.resolvedAt && (
            <p className="flex gap-2 rounded-md border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>Overdue, and this inspection takes the aircraft off the line. Signing it off returns the aircraft to service unless something else holds it.</span>
            </p>
          )}
          <SheetDetailFields>
            <SheetDetailField icon={CalendarClock} label="When" stacked>
              <InspectionCountdown reminder={r} />
            </SheetDetailField>
            {tail && r.resource && (
              <SheetDetailField icon={PlaneTakeoff} label="Aircraft">
                <Link
                  to="/aircraft/$resourceId"
                  params={{ resourceId: String(r.resource.id) }}
                  className="font-mono font-medium underline-offset-2 hover:underline"
                >
                  {tail}
                </Link>
              </SheetDetailField>
            )}
            {t && (
              <SheetDetailField icon={Gauge} label="Rule">
                <span>
                  {ruleDueLabel(t)}
                  <span className="text-muted-foreground"> · {warningLabel(t)}</span>
                </span>
              </SheetDetailField>
            )}
            {source && (
              <SheetDetailField icon={Wrench} label="Source">
                {t?.sourceUrl ? (
                  <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    {source}
                  </a>
                ) : (
                  source
                )}
              </SheetDetailField>
            )}
            {liveJob && (
              <SheetDetailField icon={Hammer} label="Work order">
                <JobLink job={liveJob.workOrder} />
              </SheetDetailField>
            )}
            {/* Files belong to an OPEN inspection; sign-off moves them onto its record. */}
            {onFiles && !r.resolvedAt && (
              <SheetDetailField icon={Paperclip} label="Files">
                <button type="button" onClick={() => onFiles(r)} className="underline-offset-2 hover:underline">
                  {hasFiles ? "Open the working files" : "No files yet. Add one"}
                </button>
              </SheetDetailField>
            )}
          </SheetDetailFields>

          {/* The panel is a peek at a row in a list. The record page is the thing you can
              bookmark, link a colleague to, and land on from a notification. */}
          <Link
            to="/maintenance/inspections/$inspectionId"
            params={{ inspectionId: String(r.id) }}
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Open the full inspection
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
      )}
    </DetailPanel>
  );
}

/** A history list's loading state. */
export function HistorySkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
