import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateMaintenanceReminderTemplate } from "@/features/queries";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPTY_SOURCE,
  InspectionSourceFields,
  sourceIsIncomplete,
  type InspectionSource,
} from "@/components/maintenance/inspection-source-fields";
import type { MaintenanceReminderTemplate } from "@/types/api";

/**
 * Edit what an inspection IS, as opposed to which aircraft it covers.
 *
 * THE REVISION IS WHY THIS EXISTS. An AD number could be set when the inspection was
 * created and never afterwards, and "the revision currently in force" is by definition a
 * value that changes: the FAA supersedes an AD, the school has Rev 2 recorded, and the
 * only way to say Rev 3 was to delete the inspection and lose every sign-off attached to
 * it. A mistyped document number had the same non-answer.
 *
 * Changing it here is safe precisely because compliance records SNAPSHOT the number and
 * revision at signature. Correcting the template going forward does not rewrite what
 * anybody already signed, which is the property that makes editing acceptable at all.
 *
 * The interval is deliberately not here. Changing "every 100 hours" to "every 50" on a
 * live rule moves due dates on every aircraft it covers, which is a different decision
 * with different consequences and belongs behind its own confirmation.
 */
export function EditInspectionModal({
  template,
  open,
  onOpenChange,
}: {
  template: MaintenanceReminderTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateMaintenanceReminderTemplate();

  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [source, setSource] = React.useState<InspectionSource>(EMPTY_SOURCE);
  const [busy, setBusy] = React.useState(false);

  //Reseeded every time it opens, so a cancelled edit does not survive into the next one.
  React.useEffect(() => {
    if (!open || !template) return;
    setName(template.name ?? "");
    setNotes(template.notes ?? "");
    setSource({
      sourceType: (template.sourceType ?? "") as InspectionSource["sourceType"],
      sourceRef: template.sourceRef ?? "",
      revision: template.revision ?? "",
      //Stored as a timestamp, edited as a plain yyyy-mm-dd: the effective date of an AD
      //revision is a calendar day, and dragging a time zone into it invites the off-by-one
      //this codebase has hit before.
      revisionDate: template.revisionDate ? template.revisionDate.slice(0, 10) : "",
      sourceUrl: template.sourceUrl ?? "",
    });
  }, [open, template?.id]);

  const invalid = !name.trim() || sourceIsIncomplete(source);

  async function submit() {
    if (!template || invalid) return;
    setBusy(true);
    try {
      await update.mutateAsync({
        id: template.id,
        name: name.trim().slice(0, 60),
        //Sent as "" rather than omitted so clearing the box actually clears the column.
        //The server reads an absent key as "leave alone" and a present value as "set it".
        notes: notes.trim(),
        sourceType: source.sourceType || null,
        //All three hang off the type, the same rule the add form uses: setting the source
        //back to Not specified has to take the number with it, or the inspection keeps an
        //AD number it no longer claims to be.
        sourceRef: source.sourceType ? source.sourceRef.trim() || null : null,
        revision: source.sourceType ? source.revision.trim() || null : null,
        revisionDate: source.sourceType ? source.revisionDate || null : null,
        sourceUrl: source.sourceType ? source.sourceUrl.trim() || null : null,
      });
      toast.success("Inspection updated.");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit inspection"
      description="Renaming it or correcting its document number does not change anything already signed off."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={invalid || busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="edit-insp-name">Name</Label>
          <Input
            id="edit-insp-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-insp-notes">Notes</Label>
          <Textarea
            id="edit-insp-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>

        <InspectionSourceFields value={source} onChange={setSource} idPrefix="edit-insp" />
      </div>
    </ResponsiveModal>
  );
}
