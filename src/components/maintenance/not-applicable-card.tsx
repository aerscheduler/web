import * as React from "react";
import { Ban, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceReminder } from "@/types/api";
import { useSetInspectionNotApplicable } from "@/features/queries";
import { formatDate } from "@/lib/utils";
import { CardEmpty, DetailCard, KeyValue, KeyValueList } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Whether this inspection applies to this aircraft at all (Murray spec 5: a VOR check on a
 * VFR-only aircraft, a 100-hour on one that is never flown for hire). Marked not applicable, it is
 * never warned about, reminded, counted overdue or grounded, and it carries to the next cycle.
 * Putting it back checks it at once, so one already overdue grounds the aircraft straight away.
 *
 * On the record page, not the list's panel: the panel is a peek with one action (Sign off).
 */
export function NotApplicableCard({ reminder: r, canManage }: { reminder: MaintenanceReminder; canManage: boolean }) {
  const [marking, setMarking] = React.useState(false);
  const [restoring, setRestoring] = React.useState(false);
  if (r.resolvedAt) return null;
  // A component's life limit applies while the part is fitted; it ends on the Components card.
  if (r.template?.componentClock && !r.notApplicableAt) return null;
  const marked = r.notApplicableAt != null;
  const tail = r.resource?.type?.plane?.tailNumber ?? "this aircraft";
  return (
    <DetailCard
      title="Applies to this aircraft"
      description={marked ? "Marked not applicable: nothing reminds about it or grounds the aircraft for it." : "Every inspection a rule puts on an aircraft applies until you say it doesn't."}
      action={<DocsHint topic="inspection-not-applicable" />}
      docShot="inspection-not-applicable"
    >
      {marked ? (
        <div className="space-y-3">
          <KeyValueList>
            <KeyValue label="Applies">No</KeyValue>
            <KeyValue label="Why">{r.notApplicableReason?.trim() || "No reason given"}</KeyValue>
            <KeyValue label="Marked">
              {formatDate(r.notApplicableAt, "MMM d, yyyy", "")}
              {r.notApplicableBy?.user?.name ? ` by ${r.notApplicableBy.user.name}` : ""}
            </KeyValue>
          </KeyValueList>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setMarking(true)}>
                Change the reason
              </Button>
              <Button variant="outline" size="sm" onClick={() => setRestoring(true)}>
                <Undo2 className="size-4" /> It applies again
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <CardEmpty>Yes. It is reminded about and counted like every other inspection on {tail}.</CardEmpty>
          {canManage && (
            <Button variant="outline" size="sm" onClick={() => setMarking(true)}>
              <Ban className="size-4" /> Mark not applicable
            </Button>
          )}
        </div>
      )}
      {marking && <MarkNotApplicable reminder={r} tail={tail} onClose={() => setMarking(false)} />}
      {restoring && <PutBack reminder={r} tail={tail} onClose={() => setRestoring(false)} />}
    </DetailCard>
  );
}

function MarkNotApplicable({ reminder: r, tail, onClose }: { reminder: MaintenanceReminder; tail: string; onClose: () => void }) {
  const save = useSetInspectionNotApplicable();
  const [reason, setReason] = React.useState(r.notApplicableReason ?? "");
  const grounding = !!r.resource?.type?.plane?.grounded && r.due?.grounds && r.due.status === "overdue";
  const submit = async () => {
    try {
      await save.mutateAsync({ id: r.id, notApplicable: true, reason });
      toast.success(`Marked not applicable on ${tail}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  };
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Not applicable on ${tail}`}
      description="Only on this aircraft. The rule, and every other aircraft it covers, stay as they are. Signing it off later keeps it marked for the next cycle."
      dataDocShot="inspection-not-applicable-modal"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Mark not applicable
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Why it doesn't apply" htmlFor="inspection-na-reason" hint="Optional. Shown wherever the inspection is listed, the owner's view included.">
          <Textarea
            id="inspection-na-reason"
            placeholder="VFR only, no VOR receiver"
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {grounding && (
          <p className="text-[13px] text-muted-foreground">
            {tail} is grounded and this inspection is overdue. If nothing else holds it, marking this returns {tail} to service.
          </p>
        )}
      </div>
    </ResponsiveModal>
  );
}

function PutBack({ reminder: r, tail, onClose }: { reminder: MaintenanceReminder; tail: string; onClose: () => void }) {
  const save = useSetInspectionNotApplicable();
  // Where the clocks would stand: an overdue one that grounds takes the aircraft off the line now.
  const wouldGround = r.due?.grounds && ((r.due.daysRemaining != null && r.due.daysRemaining < 0) || (r.due.hoursRemaining != null && r.due.hoursRemaining <= 0));
  const submit = async () => {
    try {
      const back = await save.mutateAsync({ id: r.id, notApplicable: false });
      toast.success(back.due?.status === "overdue" ? `It applies again, and it is overdue on ${tail}.` : `It applies again on ${tail}.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  };
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={`It applies to ${tail} again`}
      description="It is checked straight away, like a new inspection: reminders go out from where its clocks stand now."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            It applies again
          </Button>
        </div>
      }
    >
      {wouldGround ? (
        <p className="text-sm">It is past due, and this rule grounds the aircraft: {tail} comes off the line as soon as you save.</p>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing else about the inspection changes.</p>
      )}
    </ResponsiveModal>
  );
}
