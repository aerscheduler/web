import * as React from "react";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { toast } from "sonner";
import { useAddWorkOrderItem, useMaintenanceReminders, useSquawks, useUpdateWorkOrderItem } from "@/features/queries";
import type { WorkOrder, WorkOrderItem } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "none";

/**
 * Add a piece of work to a job, or reword one. Adding asks who raised it (the owner, or the shop
 * found it) and offers the aircraft's open inspections and squawks: attach one and the item is done
 * when that is signed off or resolved, on the console or the phone, with no second tick to forget.
 */
export function WorkOrderItemModal({
  workOrder,
  open,
  onOpenChange,
  editing,
  defaultSource = "requested",
}: {
  workOrder: WorkOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: WorkOrderItem | null;
  defaultSource?: WorkOrderItem["source"];
}) {
  const once = useSubmitOnce(open);
  const add = useAddWorkOrderItem();
  const update = useUpdateWorkOrderItem();
  const aircraftId = workOrder.aircraft.id;
  const remindersQ = useMaintenanceReminders({ resourceId: aircraftId, resolved: false }, { enabled: open && !editing });
  const squawksQ = useSquawks({ resourceId: aircraftId, resolved: false }, { enabled: open && !editing });

  const [source, setSource] = React.useState<WorkOrderItem["source"]>(defaultSource);
  const [attach, setAttach] = React.useState<string>(NONE);
  const [description, setDescription] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSource(editing?.source ?? defaultSource);
    setAttach(NONE);
    setDescription(editing?.description ?? "");
    setShowErrors(false);
  }, [open, editing, defaultSource]);

  const attachOptions: ComboOption[] = React.useMemo(
    () => [
      { value: NONE, label: "Nothing", hint: "Mark it done yourself" },
      ...(remindersQ.data ?? []).map((r) => ({
        value: `r:${r.id}`,
        label: r.template?.name ?? `Inspection #${r.id}`,
        group: "Open inspections on this aircraft",
      })),
      ...(squawksQ.data ?? []).map((s) => ({
        value: `s:${s.id}`,
        label: s.title || "Untitled squawk",
        hint: s.grounding ? "Grounding" : undefined,
        group: "Open squawks on this aircraft",
      })),
    ],
    [remindersQ.data, squawksQ.data]
  );

  // Attaching fills in the wording the person has not written yet, and says who usually raised it:
  // an inspection is usually what the owner booked, a squawk is usually something found.
  function pickAttach(value: string) {
    setAttach(value);
    const option = attachOptions.find((o) => o.value === value);
    if (value !== NONE && option && !description.trim()) setDescription(option.label);
    if (value.startsWith("s:")) setSource("found");
  }

  const descriptionError = !description.trim() || description.trim().length > 500;
  const pending = add.isPending || update.isPending;

  async function submit() {
    if (descriptionError) {
      setShowErrors(true);
      return;
    }
    if (!once.begin()) return;
    try {
      if (editing) {
        await update.mutateAsync({ workOrderId: workOrder.id, itemId: editing.id, description: description.trim() });
        toast.success("Item saved");
      } else {
        const [kind, id] = attach === NONE ? [null, null] : attach.split(":");
        await add.mutateAsync({
          workOrderId: workOrder.id,
          source,
          description: description.trim(),
          ...(kind === "r" ? { maintenanceReminderId: Number(id) } : {}),
          ...(kind === "s" ? { squawkId: Number(id) } : {}),
        });
        toast.success(source === "found" ? "Found item added" : "Item added");
      }
      onOpenChange(false);
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't save the item");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit item" : "Add an item"}
      description={`${workOrder.label}: one piece of work on the job.`}
      dataDocShot={editing ? undefined : "work-order-add-item"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add item"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editing && (
          <>
            <Field label="Who raised it" htmlFor="wo-item-source">
              <Select value={source} onValueChange={(v) => setSource(v as WorkOrderItem["source"])}>
                <SelectTrigger id="wo-item-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="requested">The owner asked for it</SelectItem>
                  <SelectItem value="found">We found it</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Discharges or fixes"
              htmlFor="wo-item-attach"
              hint="Attach an inspection or squawk and the item is done when it is signed off or resolved, here or on the phone."
            >
              <Combobox id="wo-item-attach" options={attachOptions} value={attach} onChange={pickAttach} placeholder="Nothing" />
            </Field>
          </>
        )}
        <Field label="The work" htmlFor="wo-item-description">
          <Textarea
            id="wo-item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={source === "found" ? "Cracked exhaust stack, number 3 cylinder" : "Annual inspection"}
            maxLength={500}
            rows={3}
            aria-invalid={showErrors && descriptionError}
          />
          {showErrors && descriptionError && <p className="text-xs text-destructive">Say what the work is.</p>}
        </Field>
      </div>
    </ResponsiveModal>
  );
}
