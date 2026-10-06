import * as React from "react";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { sendFindingsToOwner } from "@/features/send-to-owner";
import { fetchWorkOrderSendAudience, useAddWorkOrderItem, useMaintenanceReminders, useSquawks, useUpdateWorkOrderItem, workOrderSendAudienceKey } from "@/features/queries";
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
  const qc = useQueryClient();
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
        // A finding the owner was asked about, reworded, is asked again: the server clears its
        // answer and its send (an open one; a finding already done keeps its answer). Not on an
        // invoiced or closed job, where nothing can be asked: there the answer stands (C3).
        const askable = workOrder.invoice == null && workOrder.closedAt == null;
        const askedBefore = editing.source === "found" && !editing.done && (editing.sentToOwnerAt != null || editing.decision != null);
        if (askable && askedBefore && description.trim() !== editing.description) {
          toast.success("Reworded. Send it to the owner again: their answer was for the old wording.");
        } else {
          toast.success("Item saved");
        }
      } else {
        const [kind, id] = attach === NONE ? [null, null] : attach.split(":");
        // Findings already waiting to be sent: Notify owner sends them all, this one with them.
        const unsentBefore = (qc.getQueryData<WorkOrderItem[]>(["workOrders", "items", workOrder.id]) ?? []).filter(
          (i) => i.source === "found" && !i.decision && !i.done && !i.sentToOwnerAt
        ).length;
        await add.mutateAsync({
          workOrderId: workOrder.id,
          source,
          description: description.trim(),
          ...(kind === "r" ? { maintenanceReminderId: Number(id) } : {}),
          ...(kind === "s" ? { squawkId: Number(id) } : {}),
        });
        // Offered only where the job's Send to owner is (its `mayAsk`): a customer's aircraft, an
        // open job, no live invoice. Anywhere else there is nobody to send it to, or no sending.
        if (source === "found" && workOrder.closedAt == null && workOrder.aircraft.use === "shop" && workOrder.invoice == null) {
          // The owners don't see a finding until it is sent: offer it right here (Tony,
          // 2026-10-01). It sends every finding not yet sent, as the Send to owner button does.
          const jobId = workOrder.id;
          // Only when somebody can be reached (Tony, 2026-10-05): a Notify owner that can only fail
          // is not offered; the toast says why instead, as the disabled Send to owner does.
          const audience = await qc.fetchQuery({ queryKey: workOrderSendAudienceKey(jobId), queryFn: () => fetchWorkOrderSendAudience(jobId), staleTime: 0 }).catch(() => null);
          if (audience?.blocked) {
            toast.success("Finding added", { description: audience.blocked, duration: 10_000 });
          } else {
            toast.success("Finding added", {
              description: unsentBefore > 0 ? "The owner won't see these until you send them." : "The owner won't see it until you send it.",
              duration: 10_000,
              action: { label: "Notify owner", onClick: () => void sendFindingsToOwner(qc, jobId) },
            });
          }
        } else {
          toast.success(source === "found" ? "Found item added" : "Item added");
        }
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
                  {/* The organization's own aircraft has no owner asking for work (L15). */}
                  <SelectItem value="requested">{workOrder.aircraft.use === "shop" ? "The owner asked for it" : "Requested"}</SelectItem>
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
