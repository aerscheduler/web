import * as React from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { MaintenanceReminder, ReminderSteps } from "@/types/api";
import { useUpdateReminderSteps } from "@/features/queries";
import { ruleSteps, stepsText } from "@/lib/reminder-steps";
import { DetailCard, KeyValue, KeyValueList } from "@/components/detail/detail-page";
import { ReminderStepsFields } from "@/components/maintenance/reminder-steps-fields";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";

/**
 * When this inspection on this aircraft is said, and to whom (Murray spec 6: "for each aircraft
 * or maintenance item"). It follows the rule's reminders unless this aircraft has its own; the
 * shop changes them here for one aircraft, or on the rule for all of them.
 */
export function ReminderStepsCard({ reminder: r, canManage }: { reminder: MaintenanceReminder; canManage: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const t = r.template;
  if (!t || !r.steps) return null;
  const clocks = { days: Boolean(t.remindDays || t.remindMonths || t.remindDate), hours: Boolean(t.remindHours || t.remindAtHours != null) };
  const customer = (r.resource as { use?: string } | null | undefined)?.use === "shop";
  const own = r.ownSteps ?? null;
  const line = (days: number[], hours: number[]) =>
    [clocks.hours ? stepsText(hours, "hours") : "", clocks.days ? stepsText(days, "days") : ""].filter(Boolean).join(" or ") || "Only when it is due";
  return (
    <DetailCard
      title="Reminders"
      description={own ? "This aircraft has its own." : "The rule's, as on every aircraft it covers."}
      action={
        canManage && !r.resolvedAt ? (
          <Button variant="ghost" size="icon" className="size-7" aria-label="Change this aircraft's reminders" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
          </Button>
        ) : undefined
      }
      docShot="inspection-reminders"
    >
      <KeyValueList>
        <KeyValue label="The shop">{line(r.steps.shopDays, r.steps.shopHours)} before</KeyValue>
        {customer && <KeyValue label="The owners">{line(r.steps.ownerDays, r.steps.ownerHours)} before</KeyValue>}
      </KeyValueList>
      {editing && <EditReminderSteps reminder={r} clocks={clocks} owners={customer} onClose={() => setEditing(false)} />}
    </DetailCard>
  );
}

function EditReminderSteps({
  reminder: r,
  clocks,
  owners,
  onClose,
}: {
  reminder: MaintenanceReminder;
  clocks: { days: boolean; hours: boolean };
  owners: boolean;
  onClose: () => void;
}) {
  const save = useUpdateReminderSteps();
  const [steps, setSteps] = React.useState<ReminderSteps>(r.ownSteps ?? {});
  const submit = async () => {
    try {
      await save.mutateAsync({ id: r.id, reminderSteps: Object.keys(steps).length ? steps : null });
      toast.success(Object.keys(steps).length ? "This aircraft's reminders are saved." : "This aircraft follows the rule's reminders.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the reminders");
    }
  };
  const tail = r.resource?.type?.plane?.tailNumber ?? "this aircraft";
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      size="md"
      title={`Reminders on ${tail}`}
      description="Only for this aircraft. The rule's reminders, on every other aircraft it covers, stay as they are."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <ReminderStepsFields
        idPrefix="aircraft-reminders"
        value={steps}
        onChange={setSteps}
        defaults={ruleSteps(r.template!)}
        defaultLabel="The rule's"
        clocks={clocks}
        owners={owners}
      />
    </ResponsiveModal>
  );
}
