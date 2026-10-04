/**
 * The pieces the inspection lists share: which band an inspection is in, its figure and its
 * rail, and the menu on its row. One file, so the fleet list and the All inspections list
 * can't word the same state two ways (the lesson of the schedule list's status column,
 * 2026-09-30, which said "Not out yet" about last week's flights).
 *
 * The bands follow the SERVER's `due.status` (see `server/src/utils/maintenanceDue.ts`), with
 * one split the server does not make: an item the server cannot count down is reported as
 * "ok", but nothing about it is known to be fine. Two ways in: its clock never started (no
 * starting meter reading, no date, until somebody signs it off once), or it is counted on a
 * meter the aircraft has no reading for (a customer aircraft whose meters were never entered),
 * so how much is left is unknown and it could already be late. Either way it gets its own band
 * instead of hiding, green, among the items that are genuinely not yet due.
 *
 * One band the SERVER does make and the others follow: Not applicable (Murray spec 5), an
 * inspection marked as not applying to its aircraft. It wins over every other band and sorts last.
 * Scheduled and In progress (the job carrying it) are not bands: an inspection booked in can still
 * be overdue, which is the more urgent fact, so they ride along as a tag (`WorkTag`).
 */

import { Link } from "@tanstack/react-router";
import { AlertTriangle, Paperclip, ShieldCheck } from "lucide-react";
import type { InspectionWork, MaintenanceDue, MaintenanceReminder } from "@/types/api";
import { alsoLabel, dueAmount, dueDetail, duePercent, sourceBadge, sourceLabel } from "@/lib/maintenance";
import { cn } from "@/lib/utils";
import { LIST_TAG_BUTTON_CLASS, LIST_TAG_CLASS, ListTag } from "@/components/list-table";
import { Button } from "@/components/ui/button";

export type DueBand = "overdue" | "dueSoon" | "unstarted" | "ok" | "notApplicable";

export const DUE_BANDS: { id: DueBand; label: string; dot: string }[] = [
  { id: "overdue", label: "Overdue", dot: "var(--warning)" },
  { id: "dueSoon", label: "Due soon", dot: "color-mix(in oklch, var(--warning) 45%, var(--muted-foreground))" },
  { id: "unstarted", label: "Needs a reading or date", dot: "var(--muted-foreground)" },
  { id: "ok", label: "Not yet due", dot: "var(--success)" },
  { id: "notApplicable", label: "Not applicable", dot: "var(--border)" },
];
export const DUE_BAND_RANK = new Map(DUE_BANDS.map((b, i) => [b.id, i]));
export const DUE_BAND_BY_ID = new Map(DUE_BANDS.map((b) => [b.id, b]));

/**
 * Whether the server could count this interval down: a due point, and for a meter interval
 * a current reading to measure it against.
 */
export function clockStarted(due: MaintenanceDue | undefined): boolean {
  if (!due || due.kind === "unknown") return false;
  if (due.kind === "hours") return due.dueAtHours != null && due.hoursRemaining != null;
  return due.dueAt != null || due.daysRemaining != null;
}

/**
 * On a combined interval ("100 hours or 12 months"), whether the clock that is NOT driving
 * the figure can be counted. The server picks whichever clock is further along; when the
 * other one never started, or runs on a meter with no reading, the row would otherwise look
 * fine on its calendar half while its hour half is unknown.
 */
export function otherClockUncounted(due: MaintenanceDue | undefined): boolean {
  if (!due?.combined) return false;
  const also = due.also;
  if (!also) return true;
  return also.kind === "hours" ? also.hoursRemaining == null : also.daysRemaining == null;
}

export function dueBand(due: MaintenanceDue | undefined): DueBand {
  // Marked as not applying to this aircraft: whatever the clocks say, nothing is owed.
  if (due?.status === "notApplicable") return "notApplicable";
  // Late or close on the clock that is counting wins: that much is known.
  if (due?.status === "overdue") return "overdue";
  if (due?.status === "dueSoon") return "dueSoon";
  if (!clockStarted(due) || otherClockUncounted(due)) return "unstarted";
  return "ok";
}

/** A coloured dot, for a group header. */
export function BandDot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />;
}

/**
 * How much is left, in the unit it is counted in. Late is amber, never red: Tony's rule for
 * status text (2026-09-30), red belongs to errors.
 */
export function DueFigure({ due }: { due: MaintenanceDue | undefined }) {
  const band = dueBand(due);
  return (
    <span
      className={cn(
        "tnum",
        band === "overdue" && "font-semibold text-warning",
        band === "dueSoon" && "font-medium text-warning",
        (band === "unstarted" || band === "notApplicable") && "text-muted-foreground",
        band === "ok" && "text-foreground"
      )}
    >
      {dueAmount(due)}
    </span>
  );
}

/** How full the interval is. Full, not overflowing, once it is past due. */
export function DueRail({ due }: { due: MaintenanceDue | undefined }) {
  const band = dueBand(due);
  if (band === "unstarted" || band === "notApplicable") return null;
  return (
    <span className="block h-1 w-full overflow-hidden rounded-full bg-border" aria-hidden>
      <span
        className={cn(
          "block h-full rounded-full",
          band === "overdue" || band === "dueSoon" ? "bg-[var(--warning)]" : "bg-[var(--success)]"
        )}
        style={{ width: `${duePercent(due)}%` }}
      />
    </span>
  );
}

/** The sentence under the figure: due at what, and the other clock on a combined interval. */
export function dueSentence(due: MaintenanceDue | undefined): string {
  if (due?.status === "notApplicable") return dueDetail(due);
  let text = dueDetail(due);
  // Due at a reading, with no reading to measure it against: say why there is no figure.
  if (due?.kind === "hours" && due.dueAtHours != null && due.hoursRemaining == null && due.status !== "resolved") {
    text += " No current meter reading on this aircraft.";
  }
  const also = alsoLabel(due);
  if (also) text = `${text} ${also[0]!.toUpperCase()}${also.slice(1)}.`;
  if (due?.also?.kind === "hours" && due.also.dueAtHours != null && due.also.hoursRemaining == null && due.status !== "resolved") {
    text += " No current meter reading on this aircraft.";
  }
  // Its other clock can't be counted (and `alsoLabel` says nothing about one it can't count).
  if (otherClockUncounted(due) && due?.status !== "resolved" && !(due?.also?.kind === "hours" && due.also.dueAtHours != null)) {
    text += ` Its ${due?.kind === "hours" ? "calendar" : "hour"} clock is not counting yet.`;
  }
  return text;
}

/**
 * The sentence for an inspection's row: on one marked not applicable, the reason the shop gave
 * (the figure beside it already says "Not applicable"); otherwise where it stands (`dueSentence`).
 */
export function inspectionSentence(r: Pick<MaintenanceReminder, "due" | "notApplicableReason">): string {
  if (r.due?.status === "notApplicable") return r.notApplicableReason?.trim() || dueDetail(r.due);
  return dueSentence(r.due);
}

export const WORK_LABEL: Record<InspectionWork["status"], string> = { scheduled: "Scheduled", inProgress: "In progress" };
const WORK_DOT: Record<InspectionWork["status"], string> = {
  scheduled: "var(--muted-foreground)",
  inProgress: "var(--primary)",
};

/**
 * Scheduled or In progress (Murray spec 5): the job carrying the inspection, as a tag that opens
 * it. `owner` links to the owner's own job page. Null when no open job carries it, which is also
 * what a dispatcher is always served.
 */
export function WorkTag({
  work,
  owner = false,
  link = true,
}: {
  work: InspectionWork | null | undefined;
  owner?: boolean;
  /** False inside something that is already a link (a link may not hold another). */
  link?: boolean;
}) {
  if (!work) return null;
  const label = WORK_LABEL[work.status];
  const params = { workOrderId: String(work.job.id) };
  const className = cn(LIST_TAG_CLASS, LIST_TAG_BUTTON_CLASS);
  const inner = (
    <>
      <span className="size-1.5 rounded-full" style={{ background: WORK_DOT[work.status] }} aria-hidden />
      {label}
      <span className="font-mono">{work.job.label}</span>
    </>
  );
  if (!link) {
    return (
      <span className={LIST_TAG_CLASS} title={`${label} on ${work.job.label}`} data-testid="inspection-work-tag">
        {inner}
      </span>
    );
  }
  // A click on the tag opens the job, not the row's panel.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return owner ? (
    <Link to="/me/jobs/$workOrderId" params={params} className={className} title={`${label} on ${work.job.label}`} onClick={stop} data-testid="inspection-work-tag">
      {inner}
    </Link>
  ) : (
    <Link to="/maintenance/work-orders/$workOrderId" params={params} className={className} title={`${label} on ${work.job.label}`} onClick={stop} data-testid="inspection-work-tag">
      {inner}
    </Link>
  );
}

/**
 * The small tags after an inspection's name: the job carrying it, the rule it comes from, files,
 * grounding. `filesShown` when the row carries its own files button, which says "has files" itself.
 */
export function InspectionTags({
  reminder,
  filesShown = false,
  sourceShown = false,
}: {
  reminder: MaintenanceReminder;
  filesShown?: boolean;
  /** The group heading already names the rule and its AD/SB badge. */
  sourceShown?: boolean;
}) {
  const source = sourceShown ? null : sourceBadge(reminder.template ?? {});
  const grounds = reminder.due?.grounds && reminder.due.status === "overdue";
  const clip = reminder.hasAttachments && !filesShown;
  const work = reminder.work ?? null;
  if (!source && !clip && !grounds && !work) return null;
  return (
    <>
      <WorkTag work={work} />
      {source && (
        <span title={sourceLabel(reminder.template ?? {}) ?? undefined}>
          <ListTag>{source}</ListTag>
        </span>
      )}
      {grounds && (
        // Only on a late item: on a green row "grounds" is the rule, not news. Its title
        // says it in full; the tag stays short so the name beside it keeps its room.
        <span title="Overdue, and this inspection takes the aircraft off the line when it comes due."><ListTag className="text-warning">
          <AlertTriangle className="size-3" /> Grounds
        </ListTag></span>
      )}
      {clip && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label="Has files" />}
    </>
  );
}

/**
 * Sign off, as a visible button: the front desk runs the console on an iPad, where an action
 * that only shows on hover is no action at all, and the docs capture presses it by name.
 */
export function SignOffButton({ reminder, onSignOff }: { reminder: MaintenanceReminder; onSignOff: (r: MaintenanceReminder) => void }) {
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onSignOff(reminder)}>
      <ShieldCheck className="size-3.5" /> Sign off
    </Button>
  );
}

/** The inspection's working files, from the row's action slot. */
export function FilesIconButton({ reminder, onFiles }: { reminder: MaintenanceReminder; onFiles: (r: MaintenanceReminder) => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => onFiles(reminder)}
      aria-label="Inspection files"
      title={reminder.hasAttachments ? "Working files (has files)" : "Working files"}
      className={reminder.hasAttachments ? "relative size-7 text-foreground" : "relative size-7 text-muted-foreground"}
    >
      <Paperclip className="size-3.5" />
      {/* Has files: the dot is the paperclip tag this button replaces on the row. */}
      {reminder.hasAttachments && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" aria-hidden />}
    </Button>
  );
}

export const inspectionName = (r: MaintenanceReminder) => r.due?.name ?? r.template?.name ?? "Inspection";
