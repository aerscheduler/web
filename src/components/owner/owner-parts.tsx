import * as React from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Paperclip, PlaneTakeoff, TriangleAlert, X } from "lucide-react";
import type { OwnerAircraft, OwnerDueItem, OwnerJobSummary } from "@/types/api";
import { useRequestWork } from "@/features/queries";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Field } from "@/components/settings/parts";
import { ChipMenu, DateChip } from "@/components/property-chips";
import { useConfirm } from "@/components/confirm-dialog";
import { useFilePicker } from "@/components/maintenance/work-order-files";
import { ListTag } from "@/components/list-table";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { withMeterAnswers } from "@/lib/meter-anomaly";
import { parseTenths } from "@/lib/work-orders";
import { STAGE_GROUPS } from "@/components/maintenance/work-order-table";
import { WorkStatusIcon, type WorkStatus } from "@/components/maintenance/work-status-icon";
import { WorkTag } from "@/components/maintenance/inspection-list";
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
  // The shop marked it as not applying to this aircraft (Murray spec 5), with its reason.
  if (d.status === "notApplicable") return `${name}, not applicable${d.notApplicableReason?.trim() ? `: ${d.notApplicableReason.trim()}` : ""}`;
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
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className={dueTone(item.status)}>{dueText(item)}</span>
        {/* Already booked in with the shop: Scheduled or In progress, on the job (Murray spec 5). */}
        <WorkTag work={item.work} owner />
      </span>
    </li>
  );
}

/** The first inspection that applies: one marked not applicable is never "next". */
export function firstApplicable(due: OwnerDueItem[]): OwnerDueItem | undefined {
  return due.find((d) => d.status !== "notApplicable");
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

/**
 * The owner asks for work (Murray spec 7): what they would like done, and if they like, when it
 * could come in (a day, or from and to), when they want it back, whether it is grounded, where it
 * is, its Hobbs and tach now (a customer's aircraft only, as Update times), and photos or
 * documents. Everything but the first is optional.
 */
export function RequestWorkModal({
  open,
  onOpenChange,
  aircraft,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  aircraft: Pick<OwnerAircraft, "id" | "tailNumber"> & Partial<Pick<OwnerAircraft, "use" | "meterMode" | "hobbsTime" | "tachTime" | "owns">>;
}) {
  const send = useRequestWork(aircraft.id);
  const confirm = useConfirm();
  const once = useSubmitOnce(open);
  // The demo refuses uploads, so it offers none rather than losing them after the request sends.
  const { isDemo } = useAuth();
  const [text, setText] = React.useState("");
  const [wanted, setWanted] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [grounded, setGrounded] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const picker = useFilePicker((picked) => setFiles((had) => [...had, ...picked].slice(0, REQUEST_FILES)));
  // Its times now: a customer's aircraft, as Update times; the organization reads its own at each flight.
  const mode = aircraft.meterMode ?? "hobbs_and_tach";
  const readsTimes = aircraft.use === "shop" && aircraft.owns !== false && mode !== "none";
  const hasHobbs = readsTimes && mode !== "tach_only";
  const hasTach = readsTimes && mode !== "hobbs_only";

  const submit = async () => {
    if (!text.trim()) return setError("Say what you would like done.");
    const h = hasHobbs && hobbs.trim() ? parseTenths(hobbs) : null;
    const t = hasTach && tach.trim() ? parseTenths(tach) : null;
    if (h === undefined || t === undefined) return setError("Hours are a number, like 2461.2.");
    if (until && !from) return setError("Pick the first day it can come in, then the last.");
    if (!once.begin()) return;
    setError(null);
    try {
      const job = await withMeterAnswers(
        (a) =>
          send.mutateAsync({
            request: text.trim(),
            wantedBy: wanted || null,
            preferredFrom: from || null,
            preferredTo: from && until && until !== from ? until : null,
            grounded: grounded === "" ? null : grounded === "yes",
            location: location.trim() || null,
            ...(h != null || t != null ? { hobbsTime: h, tachTime: t } : {}),
            files: isDemo ? [] : files,
            ...a,
          }),
        confirm
      );
      if (!job) return once.fail();
      if (job.uploadError) toast.error(`${job.label} was sent, but a file did not upload: ${job.uploadError}`);
      else toast.success(`${job.label} sent to the shop. They will be in touch to schedule it.`);
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
          <DateChip id="owner-can-come-in" name="Can come in" empty="In any day" prefix="In from " value={from} onChange={(v) => (setFrom(v), v && until && until < v && setUntil(""))} />
          {from && <DateChip id="owner-can-come-until" name="Last day it can come in" empty="Just that day" prefix="Until " value={until} onChange={setUntil} />}
          <DateChip id="owner-wanted-by" name="Wanted back by" empty="Back any time" prefix="Back by " value={wanted} onChange={setWanted} />
          <ChipMenu
            id="owner-grounded"
            name="Is it grounded?"
            leading={<TriangleAlert className="size-3.5" />}
            label={grounded === "yes" ? "Grounded" : grounded === "no" ? "Airworthy" : "Grounded?"}
            set={grounded !== ""}
            value={grounded}
            onChange={setGrounded}
            options={[
              { value: "", label: "Not saying" },
              { value: "yes", label: "Grounded", hint: "It cannot fly as it is." },
              { value: "no", label: "Airworthy", hint: "It can fly in." },
            ]}
          />
        </div>
        <Field label="Where is it now?" htmlFor="owner-request-location" hint="Optional. The airport, and the hangar or tie-down if it helps the shop find it.">
          <Input id="owner-request-location" maxLength={120} placeholder="KBOI, hangar 12" value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        {readsTimes && (
          <div className="grid grid-cols-2 gap-3">
            {hasHobbs && (
              <Field label="Hobbs now" htmlFor="owner-request-hobbs" hint={aircraft.hobbsTime ? `Last on record ${hours(aircraft.hobbsTime)}` : "Optional"}>
                <Input id="owner-request-hobbs" inputMode="decimal" placeholder="1234.5" className="tnum" value={hobbs} onChange={(e) => setHobbs(e.target.value)} />
              </Field>
            )}
            {hasTach && (
              <Field label="Tach now" htmlFor="owner-request-tach" hint={aircraft.tachTime ? `Last on record ${hours(aircraft.tachTime)}` : "Optional"}>
                <Input id="owner-request-tach" inputMode="decimal" placeholder="1100.2" className="tnum" value={tach} onChange={(e) => setTach(e.target.value)} />
              </Field>
            )}
          </div>
        )}
        {!isDemo && (
          <div className="space-y-2">
            {picker.input}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={picker.open} disabled={files.length >= REQUEST_FILES}>
                <Paperclip className="size-4" /> Add photos or documents
              </Button>
              <span className="text-[12px] text-muted-foreground">Up to {REQUEST_FILES}. You can add more to the job later.</span>
            </div>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Files to send">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <ListTag>
                      <span className="max-w-[12rem] truncate">{f.name}</span>
                      <button type="button" className="ml-1 text-muted-foreground hover:text-foreground" aria-label={`Remove ${f.name}`} onClick={() => setFiles((had) => had.filter((_, j) => j !== i))}>
                        <X className="size-3" />
                      </button>
                    </ListTag>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}

/** Files sent with a request: the server's cap. More go on the job once it is open. */
const REQUEST_FILES = 5;
