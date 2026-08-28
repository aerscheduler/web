import * as React from "react";
import { toast } from "sonner";
import { useSetResourceGrounding } from "@/features/queries";
import type { Resource } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Grounding requires a reason (surfaced everywhere the plane appears), so it gets its own
 * modal rather than a bare confirm. Ungrounding is a plain confirm handled by the page.
 */
export function GroundModal({
  open,
  onOpenChange,
  resource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
}) {
  const update = useSetResourceGrounding(resource?.id ?? 0);
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const tail = resource?.type?.plane?.tailNumber ?? "this aircraft";

  function handleGround() {
    if (!resource) return;
    update.mutate(
      { grounded: true, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(`${tail} grounded`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Couldn't ground aircraft"),
      }
    );
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleGround}
              // The reason is required by the server, and it is required for a reason: it
              // is shown wherever the aircraft appears, and a reason a PERSON typed is
              // never cleared automatically the way the system's own holds are. Better to
              // say so here than to send an empty one and read back a 400.
              disabled={update.isPending || reason.trim().length === 0}
            >
              {update.isPending ? "Grounding…" : "Ground aircraft"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={`Ground ${tail}`}
      description="Grounded aircraft can't be scheduled until they're returned to service."
    >
      <div data-doc-shot="ground-aircraft-modal" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="ground-reason">Reason</Label>
          <Textarea
            id="ground-reason"
            autoFocus
            rows={3}
            placeholder="e.g. Annual inspection, oil leak, prop strike…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Shown to dispatchers and instructors wherever this tail appears.
          </p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
