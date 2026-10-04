import * as React from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { PlaneTakeoff } from "lucide-react";
import type { OwnerAircraft, OwnerDueItem, OwnerJobSummary } from "@/types/api";
import { useRequestWork } from "@/features/queries";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Field } from "@/components/settings/parts";
import { DateChip } from "@/components/property-chips";
import { STAGE_GROUPS } from "@/components/maintenance/work-order-table";
import { WorkStatusIcon, type WorkStatus } from "@/components/maintenance/work-status-icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Pieces of the owner's side of the shop (Murray spec sections 7 and 17): their aircraft, where
 * each job stands, what is coming due, and asking for work. Plain words throughout: the owner is
 * not a mechanic and does not read the shop's board.
 */

const hours = (tenths: number) => (tenths / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** The same ring the shop's board draws for a stage, so both sides read a job alike. */
export function jobIcon(status: string): WorkStatus {
  if (status === "completed") return "done";
  if (status === "cancelled") return "declined";
  return STAGE_GROUPS.find((g) => (g.statuses as string[]).includes(status))?.icon ?? "todo";
}

export function JobStatus({ job, className }: { job: Pick<OwnerJobSummary, "status" | "statusLabel">; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px]", className)}>
      <WorkStatusIcon status={jobIcon(job.status)} />
      {job.statusLabel}
    </span>
  );
}

/** "Annual inspection, due Oct 14 (in 12 days)" / "100-hour, due at tach 4,250.0 (23.4 hours left)". */
export function dueText(d: OwnerDueItem): string {
  const name = d.name ?? "Inspection";
  if (d.dueAt) {
    const when = format(parseISO(d.dueAt), "MMM d, yyyy");
    if (d.daysRemaining == null) return `${name}, due ${when}`;
    if (d.daysRemaining < 0) return `${name}, overdue since ${when}`;
    if (d.daysRemaining === 0) return `${name}, due today`;
    return `${name}, due ${when} (in ${d.daysRemaining} day${d.daysRemaining === 1 ? "" : "s"})`;
  }
  if (d.dueAtHours != null) {
    const meter = d.basis === "hobbs" ? "Hobbs" : "tach";
    if (d.hoursRemaining != null && d.hoursRemaining < 0) return `${name}, overdue (due at ${meter} ${hours(d.dueAtHours)})`;
    return `${name}, due at ${meter} ${hours(d.dueAtHours)}${d.hoursRemaining != null ? ` (${hours(d.hoursRemaining)} hours left)` : ""}`;
  }
  return `${name}, not started yet`;
}

/**
 * How an inspection's status reads. Late is amber, never red (Tony's rule for status text, as on
 * the shop's inspection list): red belongs to errors.
 */
export function dueTone(status: string) {
  return status === "overdue" ? "font-semibold text-warning" : status === "dueSoon" ? "font-medium text-warning" : "text-muted-foreground";
}

/** An aircraft owner's aircraft is grounded: said in the same amber, and strongly. */
export const GROUNDED_TONE = "font-semibold text-warning";

export function DueLine({ item }: { item: OwnerDueItem }) {
  return (
    <li className="flex items-start gap-2 text-[13px]">
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full bg-current", dueTone(item.status))} aria-hidden />
      <span className={dueTone(item.status)}>{dueText(item)}</span>
    </li>
  );
}

export function AircraftPicture({ a, className }: { a: Pick<OwnerAircraft, "photoUrl" | "tailNumber">; className?: string }) {
  const [broken, setBroken] = React.useState(false);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted text-muted-foreground", className)}>
      {a.photoUrl && !broken ? (
        <img src={a.photoUrl} alt={a.tailNumber ?? "Aircraft"} className="size-full object-cover" onError={() => setBroken(true)} />
      ) : (
        <PlaneTakeoff className="size-6" />
      )}
    </span>
  );
}

/** The owner asks for work: what they would like done, and when they would like it back. */
export function RequestWorkModal({ open, onOpenChange, aircraft }: { open: boolean; onOpenChange: (o: boolean) => void; aircraft: Pick<OwnerAircraft, "id" | "tailNumber"> }) {
  const send = useRequestWork(aircraft.id);
  const once = useSubmitOnce(open);
  const [text, setText] = React.useState("");
  const [wanted, setWanted] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const submit = async () => {
    if (!text.trim()) return setError("Say what you would like done.");
    if (!once.begin()) return;
    setError(null);
    try {
      const job = await send.mutateAsync({ request: text.trim(), wantedBy: wanted || null });
      toast.success(`${job.label} sent to the shop. They will be in touch to schedule it.`);
      onOpenChange(false);
    } catch (e) {
      once.fail();
      setError(e instanceof Error ? e.message : "Couldn't send the request");
    }
  };
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={`Request work on ${aircraft.tailNumber ?? "your aircraft"}`}
      description="The shop sees this on their board and gets in touch to schedule it."
      dataDocShot="owner-request-work"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={send.isPending}>
            {send.isPending ? "Sending…" : "Send request"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="What would you like done?" htmlFor="owner-request">
          <Textarea
            id="owner-request"
            rows={4}
            maxLength={1900}
            placeholder="Annual is due next month. The left mag drop is high and the nav light on the right wing is out."
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-invalid={error && !text.trim() ? true : undefined}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <DateChip id="owner-wanted-by" name="Wanted back by" empty="Any time" prefix="Back by " value={wanted} onChange={setWanted} />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}
