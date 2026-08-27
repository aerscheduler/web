import { useState, type FormEvent } from "react";
import { Gift, History, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { formatMonthly, formatUnitPrice } from "@/lib/subscription";
import {
  useBillingTermsOverview,
  useOrgBillingTerms,
  useSetBillingTerms,
  type BillingTermsRow,
  type PricedTerms,
} from "@/features/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/**
 * What a school pays AerScheduler, for the people who answer the phone.
 *
 * This is the surface the billing-terms table exists to make possible. Before it, the
 * answer to "is this school on the legacy 0.5% or the new plan, and why is their bill
 * that number" lived across two tables, five code constants and a hardcoded map of org
 * ids, and could only be found by reading source. Nothing here computes a price: the
 * server returns the priced verdict and this renders it, which is the same discipline
 * the customer-facing plan page now follows.
 */

const MODELS: { value: string; label: string; hint: string }[] = [
  { value: "per_aircraft", label: "Per aircraft", hint: "The standard offer: a monthly price per tail." },
  { value: "legacy_fee", label: "Legacy fee", hint: "Grandfathered: a cut of their Connect invoices, no subscription." },
  { value: "free", label: "Free", hint: "Sponsored indefinitely. Never billed, never nagged, never paywalled." },
];

const NONE = "not set";

function StateBadge({ state }: { state: string }) {
  if (state === "free") return <Badge variant="success"><Gift className="size-3" /> Free</Badge>;
  if (state === "legacy") return <Badge variant="outline">Legacy fee</Badge>;
  if (state === "active") return <Badge variant="success">Paying</Badge>;
  if (state === "expired") return <Badge variant="danger">Blocked</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

/** Dates here are calendar dates somebody typed, anchored to end-of-day UTC by the
 *  server. Render them in UTC so an employee reads back exactly what they entered. */
const shortDate = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : NONE;

/** An ISO instant as the value a date input wants. UTC for the same reason. */
const dateInputValue = (iso: string | null): string => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export function BillingTermsTab() {
  const [orgId, setOrgId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const overview = useBillingTermsOverview();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-4" />
            What we are giving away
          </CardTitle>
          <CardDescription>
            Every school not on plain standard pricing. This list is here so a comp cannot become
            permanent by being forgotten, so it deliberately shows lapsed ones too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {overview.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div className="flex flex-wrap gap-6 rounded-lg border bg-muted/30 p-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Comped monthly</div>
                  <div className="text-lg font-medium tabular-nums">
                    {formatMonthly(overview.data?.comped.cents ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Aircraft</div>
                  <div className="text-lg font-medium tabular-nums">{overview.data?.comped.units ?? 0}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Schools</div>
                  <div className="text-lg font-medium tabular-nums">{overview.data?.comped.orgs ?? 0}</div>
                </div>
              </div>

              <NonStandardTable rows={overview.data?.rows ?? []} onPick={setOrgId} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="size-4" />
            Open a school
          </CardTitle>
          <CardDescription>By organization id. Every school has terms, not just the ones above.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2 sm:max-w-xs"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(search.trim());
              if (Number.isFinite(n) && n > 0) setOrgId(n);
              else toast.error("Enter a numeric organization id.");
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Organization id, e.g. 179"
              inputMode="numeric"
            />
            <Button type="submit">Open</Button>
          </form>
        </CardContent>
      </Card>

      {orgId != null && <OrgTermsEditor key={orgId} orgId={orgId} />}
    </div>
  );
}

function NonStandardTable({ rows, onPick }: { rows: BillingTermsRow[]; onPick: (id: number) => void }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Every school is on standard pricing.</p>;
  }

  return (
    // Wide content scrolls inside its own container so the page body never does.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 pr-3 font-medium">School</th>
            <th className="py-2 pr-3 font-medium">Model</th>
            <th className="py-2 pr-3 font-medium">Free tails</th>
            <th className="py-2 pr-3 font-medium">Discount</th>
            <th className="py-2 pr-3 font-medium">Free until</th>
            <th className="py-2 pr-3 font-medium">Note</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="py-2 pr-3">
                <div className="font-medium">{r.organization.name}</div>
                <div className="text-xs text-muted-foreground">
                  #{r.organization.id} · {r.organization.code}
                </div>
              </td>
              <td className="py-2 pr-3">{MODELS.find((m) => m.value === r.model)?.label ?? r.model}</td>
              <td className="py-2 pr-3 tabular-nums">{r.freeUnits || NONE}</td>
              <td className="py-2 pr-3 tabular-nums">{r.discountPercent ? `${r.discountPercent}%` : NONE}</td>
              <td className="py-2 pr-3">{shortDate(r.freeUntil)}</td>
              <td className="max-w-[16rem] truncate py-2 pr-3 text-muted-foreground">{r.notes ?? NONE}</td>
              <td className="py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => onPick(r.organization.id)}>
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricedSummary({ priced }: { priced: PricedTerms }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <StateBadge state={priced.state} />
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Owes monthly</dt>
        <dd className="font-medium tabular-nums">{formatMonthly(priced.monthlyCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Aircraft</dt>
        <dd className="tabular-nums">
          {priced.billableUnits} billed of {priced.unitCount}
        </dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Unit price</dt>
        <dd className="tabular-nums">{formatUnitPrice(priced.unitPriceCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Connect fee</dt>
        {/* Stored in hundredths of a percent, 50 == 0.5%. Shown as a percentage
            because that is the number anybody says out loud on a call. */}
        <dd className="tabular-nums">{priced.feeRateBasis ? `${priced.feeRateBasis / 100}%` : "none"}</dd>
      </div>
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Free until</dt>
        <dd>
          {shortDate(priced.freeUntil)}
          {priced.freeUntilReason ? ` (${priced.freeUntilReason})` : ""}
        </dd>
      </div>
    </dl>
  );
}

function OrgTermsEditor({ orgId }: { orgId: number }) {
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

  const { organization, terms, priced, changes } = q.data;
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
        <CardTitle>
          {organization.name}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            #{organization.id} · {organization.code}
          </span>
        </CardTitle>
        <CardDescription>
          Signed up {shortDate(organization.createdAt)}. Every change here is recorded with your name
          and reason.
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
