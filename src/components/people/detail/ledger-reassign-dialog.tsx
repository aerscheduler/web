import { useMemo, useState } from "react";
import { useOrgUsers, useReassignLedgerFlightCharge } from "@/features/queries";
import { formatMoney } from "@/lib/utils";
import type { LedgerEntry } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { DocsHint } from "@/components/docs-hint";

/**
 * Move a flight_charge to another member (reverse + new post).
 */
export function LedgerReassignDialog({
  orgUserId,
  entry,
  open,
  onOpenChange,
}: {
  orgUserId: number;
  entry: LedgerEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const members = useOrgUsers({ enabled: open });
  const reassign = useReassignLedgerFlightCharge(orgUserId);
  const [toOrgUserId, setToOrgUserId] = useState<string>("");
  const [filter, setFilter] = useState("");

  const options = useMemo(() => {
    const list = (members.data ?? [])
      .filter((m) => m.id !== orgUserId)
      .map((m) => ({
        id: m.id,
        label: m.user?.name ?? m.identifier ?? `Member #${m.id}`,
        sub: m.user?.email ?? undefined,
      }));
    const needle = filter.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(
      (i) =>
        i.label.toLowerCase().includes(needle) ||
        (i.sub ?? "").toLowerCase().includes(needle)
    );
  }, [members.data, orgUserId, filter]);

  async function onSubmit() {
    if (!entry || !toOrgUserId) return;
    const targetId = Number(toOrgUserId);
    if (!Number.isFinite(targetId) || targetId === orgUserId) {
      toast.error("Pick a different member");
      return;
    }
    try {
      await reassign.mutateAsync({
        entryId: entry.id,
        toOrgUserId: targetId,
      });
      toast.success("Flight charge reassigned");
      onOpenChange(false);
      setToOrgUserId("");
      setFilter("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not reassign");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setToOrgUserId("");
          setFilter("");
        }
      }}
      title={<>Reassign flight charge
            <DocsHint topic="reassign-flight-charge" /></>}
      description={<>Moves{" "}
            {entry ? formatMoney(Math.abs(entry.amountCents)) : "this charge"} to
            another member. The original entry is reversed; a new charge is posted
            (never edited).</>}
      footer={<><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!toOrgUserId || reassign.isPending || !entry}
            onClick={() => void onSubmit()}
          >
            {reassign.isPending ? "Reassigning…" : "Reassign"}
          </Button></>}
    >

        

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reassign-filter">Find member</Label>
            <Input
              id="reassign-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Name or email"
            />
          </div>
          <div className="space-y-1.5">
            <Label>New payer</Label>
            <Select value={toOrgUserId} onValueChange={setToOrgUserId}>
              <SelectTrigger>
                <SelectValue placeholder={members.isPending ? "Loading…" : "Select member"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.label}
                    {m.sub ? ` · ${m.sub}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
    </ResponsiveModal>
  );
}
