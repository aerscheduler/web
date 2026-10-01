import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useSetTaxExemption, useTaxExemption } from "@/features/queries";
import type { TaxExemptReason } from "@/types/api";
import { EXEMPT_REASON_LABEL, EXEMPT_REASON_OPTIONS } from "@/lib/sales-tax";
import { DetailCard, KeyValue, KeyValueList } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/settings/parts";
import { ErrorState } from "@/components/states";

const NOT_EXEMPT = "none";

/**
 * Whether this person pays sales tax on bills raised by hand, and if not, why. Admins only,
 * on the server and here: it decides that somebody is not charged money the school owes the
 * state, and the school is who the state holds liable for an exemption it accepted.
 */
export function TaxExemptionCard({ orgUserId }: { orgUserId: number }) {
  const q = useTaxExemption(orgUserId);
  const [editing, setEditing] = useState(false);
  const reason = q.data?.reason ?? null;

  return (
    <DetailCard
      title={
        <span className="flex items-center gap-1.5">
          Sales tax <DocsHint topic="tax-exempt" />
        </span>
      }
      description="On bills you raise by hand. Flight bills from close-out are not taxed."
      docShot="person-tax-exemption"
      action={
        <Button variant="ghost" size="icon" aria-label="Edit sales tax exemption" onClick={() => setEditing(true)} disabled={!q.isSuccess}>
          <Pencil className="size-4" />
        </Button>
      }
    >
      {q.isPending ? (
        <Skeleton className="h-8 w-full" />
      ) : q.isError ? (
        // Never "taxed by your rules" on a failed read: an exempt customer would look taxed,
        // and saving the form from there would clear the exemption.
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : reason ? (
        <KeyValueList>
          <KeyValue label="Exempt">{EXEMPT_REASON_LABEL[reason]}</KeyValue>
          {q.data?.note && <KeyValue label="Note">{q.data.note}</KeyValue>}
        </KeyValueList>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="tax-exemption-none">
          Taxed by your organization&apos;s rules.
        </p>
      )}
      {editing && (
        <ExemptionModal
          orgUserId={orgUserId}
          current={{ reason, note: q.data?.note ?? null }}
          onClose={() => setEditing(false)}
        />
      )}
    </DetailCard>
  );
}

function ExemptionModal({
  orgUserId,
  current,
  onClose,
}: {
  orgUserId: number;
  current: { reason: TaxExemptReason | null; note: string | null };
  onClose: () => void;
}) {
  const save = useSetTaxExemption(orgUserId);
  const [reason, setReason] = useState<string>(current.reason ?? NOT_EXEMPT);
  const [note, setNote] = useState(current.note ?? "");
  useEffect(() => {
    if (reason === NOT_EXEMPT) setNote("");
  }, [reason]);

  function submit() {
    const body = reason === NOT_EXEMPT ? { reason: null, note: null } : { reason: reason as TaxExemptReason, note: note.trim() || null };
    save.mutate(body, {
      onSuccess: () => {
        toast.success(body.reason ? "Marked exempt from sales tax" : "No longer exempt from sales tax");
        onClose();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save"),
    });
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Sales tax exemption"
      description="Bills you raise by hand for them carry no sales tax and print this reason. Keep their certificate on file."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Exemption" htmlFor="tax-exempt-reason">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger id="tax-exempt-reason" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOT_EXEMPT}>Not exempt</SelectItem>
              {EXEMPT_REASON_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {reason !== NOT_EXEMPT && (
          <Field
            label="Note"
            htmlFor="tax-exempt-note"
            hint="Which certificate you hold, for example ST-101 on file. Printed on their invoices."
          >
            <Input id="tax-exempt-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="ST-101 on file" />
          </Field>
        )}
      </div>
    </ResponsiveModal>
  );
}
