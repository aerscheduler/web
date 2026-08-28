import { useState, type FormEvent } from "react";
import { History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useOrgBillingTerms, useSetBillingTerms } from "@/features/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  MODELS,
  PricedSummary,
  dateInputValue,
} from "@/components/developer/billing-terms-shared";

/**
 * One school's terms, as an editable pane on its organization page.
 *
 * Nothing here computes a price. The server returns the priced verdict and this
 * renders it, the same discipline the customer-facing plan page follows, so an
 * employee and a school owner can never be looking at two different arithmetic.
 */

export function OrgBillingTerms({ orgId }: { orgId: number }) {
  const q = useOrgBillingTerms(orgId);
  const save = useSetBillingTerms(orgId);

  const [form, setForm] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");

  if (q.isLoading) return <Skeleton className="h-64 w-full" />;
  if (q.error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          {q.error instanceof ApiError ? q.error.message : "Could not load that school."}
        </CardContent>
      </Card>
    );
  }
  if (!q.data) return null;

  const { terms, priced, changes } = q.data;
  // Uncontrolled-until-touched: the field shows what is stored until somebody edits it,
  // so an untouched field is never submitted as a change it did not make.
  const val = (key: string, stored: string | number | null | undefined) =>
    form[key] ?? (stored == null ? "" : String(stored));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error("Say why. It is recorded against this school and someone will read it later.");
      return;
    }
    try {
      await save.mutateAsync({
        model: val("model", terms?.model ?? "per_aircraft"),
        unitPriceCents: form.unitPriceCents === "" ? null : form.unitPriceCents ?? terms?.unitPriceCents ?? null,
        freeUnits: Number(val("freeUnits", terms?.freeUnits ?? 0)),
        discountPercent: Number(val("discountPercent", terms?.discountPercent ?? 0)),
        discountEndsAt: form.discountEndsAt ?? dateInputValue(terms?.discountEndsAt ?? null),
        feeRateBasis: form.feeRateBasis === "" ? null : form.feeRateBasis ?? terms?.feeRateBasis ?? null,
        freeUntil: form.freeUntil ?? dateInputValue(terms?.freeUntil ?? null),
        freeUntilReason: val("freeUntilReason", terms?.freeUntilReason ?? ""),
        notes: val("notes", terms?.notes ?? ""),
        reason: reason.trim(),
      });
      toast.success("Billing terms updated.");
      setReason("");
      setForm({});
      void q.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save those terms.");
    }
  };

  const set = (key: string) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing terms</CardTitle>
        <CardDescription>
          What this school pays us, and on what terms. Every change is recorded with your name and
          your reason.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <PricedSummary priced={priced} />

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="model">Pricing model</Label>
              <select
                id="model"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={val("model", terms?.model ?? "per_aircraft")}
                onChange={set("model")}
              >
                {MODELS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {MODELS.find((m) => m.value === val("model", terms?.model ?? "per_aircraft"))?.hint}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="freeUnits">Free aircraft</Label>
              <Input id="freeUnits" inputMode="numeric" value={val("freeUnits", terms?.freeUnits ?? 0)} onChange={set("freeUnits")} />
              <p className="text-xs text-muted-foreground">
                Billed on the tails beyond this. Set it at or above their fleet ({priced.unitCount}) to
                make the school free while still showing them the real arithmetic.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="discountPercent">Discount %</Label>
              <Input
                id="discountPercent"
                inputMode="numeric"
                value={val("discountPercent", terms?.discountPercent ?? 0)}
                onChange={set("discountPercent")}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="discountEndsAt">Discount ends</Label>
              <Input
                id="discountEndsAt"
                type="date"
                value={form.discountEndsAt ?? dateInputValue(terms?.discountEndsAt ?? null)}
                onChange={set("discountEndsAt")}
              />
              <p className="text-xs text-muted-foreground">Blank means the allowance and discount never lapse.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unitPriceCents">Unit price, cents</Label>
              <Input
                id="unitPriceCents"
                inputMode="numeric"
                placeholder="blank = list price"
                value={form.unitPriceCents ?? (terms?.unitPriceCents == null ? "" : String(terms.unitPriceCents))}
                onChange={set("unitPriceCents")}
              />
              <p className="text-xs text-muted-foreground">
                Blank follows the list price when it moves. A number here is a price we quoted and
                stays put.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feeRateBasis">Connect fee, hundredths of a %</Label>
              <Input
                id="feeRateBasis"
                inputMode="numeric"
                placeholder="blank = standard 0.5% (50)"
                value={form.feeRateBasis ?? (terms?.feeRateBasis == null ? "" : String(terms.feeRateBasis))}
                onChange={set("feeRateBasis")}
              />
              <p className="text-xs text-muted-foreground">
                50 is 0.5%. Only applies on the legacy model; a per-aircraft school is never charged
                both.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="freeUntil">Free until</Label>
              <Input
                id="freeUntil"
                type="date"
                value={form.freeUntil ?? dateInputValue(terms?.freeUntil ?? null)}
                onChange={set("freeUntil")}
              />
              <p className="text-xs text-muted-foreground">
                Free access through this date whatever the model says. For an indefinite sponsorship
                use the Free model instead, so it cannot lapse by accident.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="freeUntilReason">Free window reason</Label>
              <select
                id="freeUntilReason"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
                value={val("freeUntilReason", terms?.freeUntilReason ?? "")}
                onChange={set("freeUntilReason")}
              >
                <option value="">None</option>
                <option value="trial">Trial</option>
                <option value="grace">Grace</option>
                <option value="courtesy">Courtesy</option>
              </select>
              <p className="text-xs text-muted-foreground">Decides which words their banner uses.</p>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes, shown to us only</Label>
            <Input
              id="notes"
              value={val("notes", terms?.notes ?? "")}
              onChange={set("notes")}
              placeholder="Sponsored, EAA chapter. 3 tails comped through the pilot."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Why are you changing this?</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Agreed on the call with their owner: 3 tails free through the end of the pilot."
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              Required. Recorded against this school so the next person can tell what was agreed.
            </p>
          </div>

          {/* Enabled regardless of field state; validation happens on submit with a
              visible reason. (House rule, never ship a silently-disabled submit.) */}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save terms
          </Button>
        </form>

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <History className="size-4" />
            History
          </h3>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No changes recorded. Their terms are whatever the backfill wrote when this table was
              created.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {changes.map((c) => (
                <li key={c.id} className="rounded-lg border p-2.5">
                  <div className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()} · {c.changedBy}
                  </div>
                  <div>{c.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
