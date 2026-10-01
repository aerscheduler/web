import * as React from "react";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { toast } from "sonner";
import { useRecordOwnerAnswer } from "@/features/queries";
import type { WorkOrder, WorkOrderItem } from "@/types/api";
import { cn } from "@/lib/utils";
import { ResponsiveModal } from "@/components/responsive-modal";
import { MoneyInput } from "@/components/money-input";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Answer = NonNullable<WorkOrderItem["decision"]>;
const ANSWERS: { value: Answer; label: string }[] = [
  { value: "approved", label: "Approve" },
  { value: "declined", label: "Decline" },
  { value: "deferred", label: "Defer" },
];

/** "2026-09-29T14:05" in the viewer's own clock, for a datetime-local input. */
function localNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Record what the owner said on the phone (Murray §10): who you reached, when, the most they will
 * spend, notes, and approve, decline or defer for each item you discussed. A record of a call, not
 * something the owner signs: they never log in.
 *
 * Found items that nobody has asked about come first and start unanswered; an item already
 * answered can be answered again (the owner changed their mind), and then points at this call.
 */
export function RecordOwnerAnswerModal({
  workOrder,
  items,
  open,
  onOpenChange,
}: {
  workOrder: WorkOrder;
  items: WorkOrderItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const once = useSubmitOnce(open);
  const record = useRecordOwnerAnswer();
  const [contactName, setContactName] = React.useState("");
  const [contactedAt, setContactedAt] = React.useState("");
  const [limit, setLimit] = React.useState<number | undefined>(undefined);
  const [notes, setNotes] = React.useState("");
  const [answers, setAnswers] = React.useState<Record<number, Answer | undefined>>({});
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setContactName(workOrder.billTo?.name ?? "");
    setContactedAt(localNow());
    setLimit(undefined);
    setNotes("");
    setAnswers({});
    setShowErrors(false);
  }, [open, workOrder.billTo?.name]);

  // Undecided found items first: those are the reason for the call.
  const ordered = React.useMemo(
    () =>
      [...items].sort((a, b) => {
        const rank = (i: WorkOrderItem) => (i.source === "found" && !i.decision ? 0 : i.decision ? 2 : 1);
        return rank(a) - rank(b) || a.position - b.position;
      }),
    [items]
  );

  const chosen = Object.entries(answers).filter((e): e is [string, Answer] => e[1] != null);
  const nameError = !contactName.trim();
  const noAnswers = chosen.length === 0;

  async function submit() {
    if (nameError || noAnswers) {
      setShowErrors(true);
      return;
    }
    if (!once.begin()) return;
    try {
      await record.mutateAsync({
        workOrderId: workOrder.id,
        contactName: contactName.trim(),
        // The input is the viewer's local clock; the server wants an instant.
        contactedAt: contactedAt ? new Date(contactedAt).toISOString() : undefined,
        spendLimitCents: limit ?? null,
        notes: notes.trim() || null,
        decisions: chosen.map(([itemId, decision]) => ({ itemId: Number(itemId), decision })),
      });
      toast.success("Owner's answer recorded");
      onOpenChange(false);
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't record the answer");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Record the owner's answer"
      description="Who you spoke to, and what they said about each item. The owner does not log in; this is your record of the call."
      dataDocShot="work-order-owner-answer"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={record.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={record.isPending}>
            {record.isPending ? "Saving…" : "Record answer"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who you spoke to" htmlFor="wo-answer-name">
            <Input placeholder="Walter Brenner" id="wo-answer-name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={120} aria-invalid={showErrors && nameError} />
            {showErrors && nameError && <p className="text-xs text-destructive">Say who you spoke to.</p>}
          </Field>
          <Field label="When" htmlFor="wo-answer-when">
            <Input id="wo-answer-when" type="datetime-local" value={contactedAt} onChange={(e) => setContactedAt(e.target.value)} />
          </Field>
        </div>
        <Field label="Spend limit (optional)" htmlFor="wo-answer-limit" hint="The most they said you can spend without calling again.">
          <MoneyInput id="wo-answer-limit" cents={limit} onCentsChange={setLimit} onClear={() => setLimit(undefined)} className="w-40" placeholder="No limit" />
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">What they said</p>
          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add the items you discussed to the job first.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {ordered.map((item) => {
                const answer = answers[item.id];
                return (
                  <li key={item.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate">{item.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.source === "found" ? "Found" : "Requested"}
                        {item.decision ? `, ${item.decision} before` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 gap-1" role="radiogroup" aria-label={`Answer for ${item.description}`}>
                      {ANSWERS.map((a) => (
                        <Button
                          key={a.value}
                          type="button"
                          size="sm"
                          variant={answer === a.value ? "default" : "outline"}
                          role="radio"
                          aria-checked={answer === a.value}
                          className={cn(answer === a.value && a.value === "declined" && "bg-destructive text-white hover:bg-destructive/90")}
                          onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: prev[item.id] === a.value ? undefined : a.value }))}
                        >
                          {a.label}
                        </Button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {showErrors && noAnswers && <p className="text-xs text-destructive">Choose an answer for at least one item.</p>}
        </div>

        <Field label="Notes (optional)" htmlFor="wo-answer-notes">
          <Textarea id="wo-answer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} placeholder="Wants the exhaust done now; the paint can wait until spring." />
        </Field>
      </div>
    </ResponsiveModal>
  );
}
