import * as React from "react";
import { toast } from "sonner";
import { useResolveSquawk } from "@/features/queries";
import { resourceLabel, type Squawk } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";

/**
 * Confirm a reported fault before anyone works it.
 *
 * Verifying and resolving are two different stamps and the server keeps two different
 * columns for them: `verifiedAt` says a qualified person reproduced the fault, `resolvedAt`
 * says the work is done. The console could only ever write the second, which meant a
 * technician who wanted to record "yes, I saw it too, it is real" had to reach for the
 * phone, or sign the squawk off as fixed when it was not.
 *
 * Deliberately not a bare confirm dialog even though it posts no fields: the two verbs are
 * one letter apart in a menu and the difference matters, so the body says which one this is
 * and what it does not do.
 */
export function VerifySquawkModal({
  squawk,
  open,
  onOpenChange,
  onVerified,
}: {
  squawk: Squawk | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after the stamp lands, for callers that want to close a panel behind it. */
  onVerified?: () => void;
}) {
  // Same endpoint as resolve, `action: "verify"`, and it takes no other fields.
  const verify = useResolveSquawk();
  const [formError, setFormError] = React.useState<string | null>(null);

  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) setFormError(null);
    wasOpen.current = open;
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!squawk || verify.isPending) return;
    setFormError(null);

    try {
      await verify.mutateAsync({ id: squawk.id, action: "verify" });
      toast.success("Squawk verified.");
      onOpenChange(false);
      onVerified?.();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't verify that squawk.";
      setFormError(msg);
      toast.error(msg);
    }
  }

  const resource = squawk?.resource ? resourceLabel(squawk.resource).name : null;

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit"
                form="modal-verify-squawk-modal" disabled={verify.isPending}>
              {verify.isPending ? "Verifying…" : "Verify squawk"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Verify squawk"
      description="Record that the fault is real and has been seen."
    >
      <form id="modal-verify-squawk-modal" onSubmit={submit} className="space-y-4">
        {squawk && (
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{squawk.title || "Untitled squawk"}</p>
            {resource && <p className="text-muted-foreground">{resource}</p>}
            {squawk.description && (
              <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">
                {squawk.description}
              </p>
            )}
          </div>
        )}

        <p className="text-[13px] text-muted-foreground">
          This stamps your name and the time against the write-up. It does not close the
          squawk or return the aircraft to service: sign it off separately once the work is
          done.
        </p>

        {formError && (
          <p className="text-sm text-destructive" role="alert">
            {formError}
          </p>
        )}

      </form>
    </ResponsiveModal>
  );
}
