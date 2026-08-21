import { useState } from "react";
import { toast } from "sonner";
import { usePostRequirementCredit } from "@/features/queries";
import { holdsTrainingGrant } from "@/lib/training";
import { useMyTrainingGrants } from "@/features/queries";
import type { Standing } from "@/types/api";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Recording training a student did somewhere else.
 *
 * `POST /training/credits` has existed since the ledger shipped and nothing in this console
 * ever called it, the mutation hook sat here with no caller. That made the single most
 * common day-one task for a school switching to us impossible without the API: a school
 * arriving with twenty part-trained students had no way to enter their prior hours.
 *
 * THE DATE IS THE POINT, and it is why this is a form rather than two fields. A requirement
 * can carry a recency window (the three hours of test preparation must be within two
 * calendar months of the checkride), and the ledger judges that by when the flying HAPPENED,
 * not by when somebody typed it in. Defaulting the date to today, which is what the server
 * did before this, silently makes a 2019 logbook look current forever.
 */

const SOURCES = [
  {
    value: "transfer_61",
    label: "Previous training (Part 61)",
    hint: "Hours from another school or instructor, verified against their logbook.",
  },
  {
    value: "transfer_141",
    label: "Previous training (Part 141)",
    hint: "Credit from another approved course. §141.77 limits how much may count.",
  },
  {
    value: "simulator",
    label: "Simulator or training device",
    hint: "Counted separately so the course's device ceiling can be applied.",
  },
  {
    value: "manual",
    label: "Correction by hand",
    hint: "A backfill. Needs a note saying where the time came from.",
  },
] as const;

export function AddCreditDialog({
  enrollmentId,
  standings,
}: {
  enrollmentId: number;
  standings: Standing[];
}) {
  const [open, setOpen] = useState(false);
  const [requirementId, setRequirementId] = useState<string>("");
  const [source, setSource] = useState<string>("transfer_61");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [notes, setNotes] = useState("");
  const post = usePostRequirementCredit();

  //Server: hasTrainingGrant("manageEnrollment"). Fails closed while the grants load.
  const mine = useMyTrainingGrants();
  if (!holdsTrainingGrant(mine.data, "manageEnrollment")) return null;

  const requirement = standings.find((s) => String(s.requirementId) === requirementId);
  //A requirement is measured one way or the other, never both, so the form asks for
  //whichever this one uses rather than offering two boxes and rejecting one.
  const measuresHours = requirement ? requirement.requiredDeciHours != null : true;

  const reset = () => {
    setRequirementId("");
    setSource("transfer_61");
    setAmount("");
    setOccurredAt("");
    setNotes("");
  };

  const submit = async () => {
    if (!requirement) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter how much to credit.");
      return;
    }
    try {
      await post.mutateAsync({
        enrollmentId,
        requirementId: requirement.requirementId,
        //Tenths on the wire; the field asks for hours because that is what a logbook says.
        ...(measuresHours ? { deciHours: Math.round(value * 10) } : { count: Math.round(value) }),
        source,
        notes: notes.trim() || undefined,
        //Sent as a plain date. Omitted means "today", which is right for a simulator
        //session logged this afternoon and wrong for a logbook.
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
      });
      toast.success("Credit posted to the ledger.");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const chosenSource = SOURCES.find((s) => s.value === source);

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
          Add credit
        </Button>
      <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      title="Credit training from elsewhere"
      description={<>Goes onto the ledger as its own entry, alongside the lessons. Nothing is
            overwritten, and any ceiling this course sets is applied on top.</>}
      footer={<><Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!requirement || post.isPending}>
            {post.isPending ? "Posting…" : "Post credit"}
          </Button></>}
      data-doc-shot="add-credit-dialog"
    >

        

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Requirement</Label>
            <Select value={requirementId} onValueChange={setRequirementId}>
              <SelectTrigger>
                <SelectValue placeholder="Which requirement does this count toward?" />
              </SelectTrigger>
              <SelectContent>
                {standings.map((s) => (
                  <SelectItem key={s.requirementId} value={String(s.requirementId)}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Where it came from</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosenSource && (
              <p className="text-xs text-muted-foreground">{chosenSource.hint}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{measuresHours ? "Hours" : "How many"}</Label>
              <Input
                type="number"
                step={measuresHours ? "0.1" : "1"}
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={measuresHours ? "e.g. 18.4" : "e.g. 3"}
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label>When it was flown</Label>
                <DocsHint topic="prior-training-credit" />
              </div>
              <Input
                type="date"
                value={occurredAt}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          {/* Said out loud, because it is not guessable and it is the whole reason the
              date field exists. */}
          {requirement?.recencyCalendarMonths ? (
            <p className="text-xs text-muted-foreground">
              This requirement only counts training from the last{" "}
              {requirement.recencyCalendarMonths} calendar month
              {requirement.recencyCalendarMonths === 1 ? "" : "s"}, so the date decides
              whether these hours count toward it today.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label>
              Note {source === "manual" ? "" : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Logbook verified, previous school named…"
            />
          </div>
        </div>
    </ResponsiveModal>
    </>
  );
}
