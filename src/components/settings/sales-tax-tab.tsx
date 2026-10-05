import { useEffect, useMemo, useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useArchiveSalesTaxRate,
  useCreateSalesTaxRate,
  useSalesTaxSettings,
  useSetSalesTaxRules,
  useUpdateSalesTaxRate,
} from "@/features/queries";
import type { InvoiceLineCategory, SalesTaxRate, SalesTaxSettings } from "@/types/api";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { LINE_CATEGORY_OPTIONS, parseRatePpm, percentLabel, percentText } from "@/lib/sales-tax";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorState } from "@/components/states";
import { DocsHint } from "@/components/docs-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { useConfirm } from "@/components/confirm-dialog";
import { Field } from "@/components/settings/parts";

/**
 * SALES TAX: the school's rates, and which kinds of invoice line each one taxes.
 *
 * Nothing is taxed until a rate exists AND a category points at it (or somebody ticks a
 * single line on New invoice). The rules themselves, and the arithmetic, live on the server
 * (utils/salesTax.ts); this screen only edits them. Admins read, the owner edits, the same
 * as the billing settings beside it. Research and design: SALES-TAX-DESIGN.md.
 */
export function SalesTaxTab() {
  const q = useSalesTaxSettings();
  if (q.isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </CardContent>
      </Card>
    );
  }
  return <SalesTax data={q.data!} />;
}

type Editing = { mode: "new" } | { mode: "edit"; rate: SalesTaxRate } | null;

function SalesTax({ data }: { data: SalesTaxSettings }) {
  const { roles } = useAuth();
  // Owners and admins: admins already set the shop's rates, raise invoices and set a customer's
  // exemption, so the rate those invoices charge is theirs too (Tony, 2026-10-04).
  const canEdit = isAdmin(roles);
  const archive = useArchiveSalesTaxRate();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Editing>(null);

  // Memoised: Rules resets its unsaved draft when the list it is given changes, and a fresh
  // array on every render (opening Edit, cancelling Archive) wiped the owner's choices.
  const live = useMemo(() => data.rates.filter((r) => !r.archivedAt), [data.rates]);
  const archived = useMemo(() => data.rates.filter((r) => r.archivedAt), [data.rates]);

  async function archiveRate(rate: SalesTaxRate) {
    const ok = await confirm({
      title: `Archive ${rate.name}?`,
      description:
        "It stops applying to new invoices, and the kinds of line it taxed stop being taxed until you pick another rate for them. Invoices already raised keep the tax they charged.",
      confirmLabel: "Archive rate",
      destructive: true,
    });
    if (!ok) return;
    archive.mutate(rate.id, {
      onSuccess: () => toast.success(`${rate.name} archived`),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't archive the rate"),
    });
  }

  return (
    <div className="space-y-4" data-doc-shot="sales-tax-settings">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Sales tax rates <DocsHint topic="sales-tax-settings" />
          </CardTitle>
          <CardDescription>
            Once you add a rate, New invoice shows a Taxable tick on every line, and the kinds of line you
            choose below are ticked for you. Bills that close-out raises for flights are not taxed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {live.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.suggestion && data.suggestion.state.ratePpm > 0
                ? `No rates yet. Your airport is in ${data.suggestion.state.name}, where the statewide rate is ${percentLabel(data.suggestion.state.ratePpm)}; Add rate starts from that.`
                : data.suggestion
                  ? `No rates yet. ${data.suggestion.state.name} has no statewide sales tax; check whether your city or borough charges one.`
                  : "No rates yet. Add the rate you charge, for example Idaho sales tax, 6%, or VAT."}
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {live.map((rate) => (
                <li key={rate.id} className="flex items-center justify-between gap-3 px-3 py-2.5" data-testid="sales-tax-rate">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {rate.name} <span className="tnum text-muted-foreground">{percentLabel(rate.ratePpm)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        rate.jurisdiction,
                        rate.country !== "US" ? (data.countries.find((c) => c.code === rate.country)?.name ?? rate.country) : null,
                        rate.usedOnLines ? `On ${rate.usedOnLines} invoice line${rate.usedOnLines === 1 ? "" : "s"}` : "Not charged yet",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Edit ${rate.name}`} onClick={() => setEditing({ mode: "edit", rate })}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={`Archive ${rate.name}`} onClick={() => void archiveRate(rate)}>
                        <Archive className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setEditing({ mode: "new" })}>
              <Plus className="size-4" /> Add rate
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Only an owner or admin of the organization can change sales tax.</p>
          )}
          {archived.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {archived.length === 1 ? "1 archived rate" : `${archived.length} archived rates`} (
              {archived
                .slice(0, 3)
                .map((r) => `${r.name} ${percentLabel(r.ratePpm)}`)
                .join(", ")}
              {archived.length > 3 ? `, and ${archived.length - 3} more` : ""}). Old invoices keep the tax they charged.
            </p>
          )}
        </CardContent>
      </Card>

      {live.length > 0 && <Rules data={data} live={live} canEdit={canEdit} />}

      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">A customer who doesn't pay sales tax</span> (a dealer
            buying for resale, a government agency): open their page in People and set the Sales tax card to exempt. Their
            invoices are never taxed, and each one prints the reason.
          </p>
          <p>
            <span className="font-medium text-foreground">If you use QuickBooks:</span> invoices with sales tax on them
            are not synced yet. You'll find them in QuickBooks settings under Needs attention, to enter in QuickBooks
            yourself.
          </p>
        </CardContent>
      </Card>

      {editing && (
        <RateModal
          editing={editing}
          settings={data}
          firstRate={live.length === 0}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

const NOT_TAXED = "none";

function Rules({ data, live, canEdit }: { data: SalesTaxSettings; live: SalesTaxRate[]; canEdit: boolean }) {
  const save = useSetSalesTaxRules();
  const initial = useMemo(() => {
    const out = {} as Record<InvoiceLineCategory, string>;
    for (const o of LINE_CATEGORY_OPTIONS) {
      const id = data.rules[o.value];
      out[o.value] = id != null && live.some((r) => r.id === id) ? String(id) : NOT_TAXED;
    }
    return out;
  }, [data.rules, live]);
  const [draft, setDraft] = useState(initial);
  // Reset only when the SAVED rules change. Adding or renaming a rate re-renders with new
  // objects and must not wipe unsaved choices (the live ids used to be in this key, so adding a
  // rate reset every choice to Not taxed).
  const savedKey = JSON.stringify(data.rules);
  useEffect(() => setDraft(initial), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // When a rate stops being live (archived), only the choices that pointed at it fall back, so
  // Save can never send an archived rate.
  const liveKey = live.map((r) => r.id).join(",");
  useEffect(() => {
    setDraft((d) => {
      let changed = false;
      const next = { ...d };
      for (const o of LINE_CATEGORY_OPTIONS) {
        if (d[o.value] !== NOT_TAXED && !live.some((r) => String(r.id) === d[o.value])) {
          next[o.value] = initial[o.value];
          changed = true;
        }
      }
      return changed ? next : d;
    });
  }, [liveKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = LINE_CATEGORY_OPTIONS.some((o) => draft[o.value] !== initial[o.value]);

  function submit() {
    const rules: Record<string, number | null> = {};
    for (const o of LINE_CATEGORY_OPTIONS) rules[o.value] = draft[o.value] === NOT_TAXED ? null : Number(draft[o.value]);
    save.mutate(rules, {
      onSuccess: () => toast.success("Saved. New invoices use these rules."),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't save"),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What gets taxed</CardTitle>
        <CardDescription>
          The starting point for every line on a bill you raise by hand. Whoever raises the bill can still tick or
          untick a single line, for example a part replaced under warranty. In most states parts are taxed and labor
          listed on its own line is not; check with your accountant.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {LINE_CATEGORY_OPTIONS.map((o) => (
          <div key={o.value} className="flex items-center justify-between gap-3 py-1.5" data-testid={`sales-tax-rule-${o.value}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium">{o.label}</p>
              <p className="text-xs text-muted-foreground">{o.hint}</p>
            </div>
            <Select
              value={draft[o.value]}
              onValueChange={(v) => setDraft((d) => ({ ...d, [o.value]: v }))}
              disabled={!canEdit}
            >
              <SelectTrigger className="h-8 w-48 shrink-0 text-xs" aria-label={`Tax on ${o.label.toLowerCase()}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_TAXED}>Not taxed</SelectItem>
                {live.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name} {percentLabel(r.ratePpm)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {canEdit && (
          <div className="flex justify-end pt-3">
            <Button onClick={submit} disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const OUTSIDE_US = "__outside";
const NO_STATE = "__none";

function RateModal({
  editing,
  settings,
  firstRate,
  onClose,
}: {
  editing: NonNullable<Editing>;
  settings: SalesTaxSettings;
  firstRate: boolean;
  onClose: () => void;
}) {
  const create = useCreateSalesTaxRate();
  const update = useUpdateSalesTaxRate();
  const setRules = useSetSalesTaxRules();
  const rate = editing.mode === "edit" ? editing.rate : null;
  const stateByCode = useMemo(() => new Map(settings.states.map((s) => [s.code, s])), [settings.states]);

  // Where a new rate starts. The school's first rate is filled in from what AerScheduler
  // already knows: the one state its airports are in, that state's statewide rate, and a name.
  // Nothing is saved until the owner checks it and clicks Add rate.
  const prefill = !rate && firstRate && settings.suggestion ? settings.suggestion : null;
  // An existing rate reopens on the country it was saved with, never on a guess from its
  // region: "WA" abroad is Western Australia, not Washington.
  const abroad = rate != null && rate.country !== "US";
  const initialChoice = rate
    ? abroad
      ? OUTSIDE_US
      : (rate.jurisdiction ?? NO_STATE)
    : prefill
      ? prefill.state.code
      : settings.outsideUs
        ? OUTSIDE_US
        : NO_STATE;
  const [choice, setChoice] = useState<string>(initialChoice);
  const [country, setCountry] = useState(abroad ? rate.country : "");
  const [region, setRegion] = useState(abroad ? (rate.jurisdiction ?? "") : "");
  const [name, setName] = useState(rate?.name ?? (prefill ? `${prefill.state.name} sales tax` : ""));
  const [percent, setPercent] = useState(
    rate ? percentText(rate.ratePpm) : prefill && prefill.state.ratePpm > 0 ? percentText(prefill.state.ratePpm) : ""
  );
  // Tax parts and goods at the first rate: the rule almost every state that taxes repairs uses,
  // and the one Murray's shop asked for. Only offered when no rule exists yet.
  const offerParts = !rate && Object.keys(settings.rules).length === 0;
  const [applyToParts, setApplyToParts] = useState(true);
  const [showErrors, setShowErrors] = useState(false);

  const picked = stateByCode.get(choice) ?? null;
  // Once a line has been charged at the rate, only its name changes: the percentage and where
  // the tax is owed are what that old invoice says it charged.
  const locked = (rate?.usedOnLines ?? 0) > 0;
  const ratePpm = parseRatePpm(percent);
  const nameError = !name.trim() || name.trim().length > 50;
  const percentError = ratePpm == null;
  const countryError = choice === OUTSIDE_US && !country;
  const pending = create.isPending || update.isPending || setRules.isPending;

  // Picking a state fills the name and rate the person has not made their own yet.
  function pickState(next: string) {
    const prev = stateByCode.get(choice);
    const nextState = stateByCode.get(next);
    setChoice(next);
    if (rate) return;
    if (nextState && (!name.trim() || (prev && name.trim() === `${prev.name} sales tax`))) setName(`${nextState.name} sales tax`);
    const prevAuto = prev && prev.ratePpm > 0 ? percentText(prev.ratePpm) : "";
    if (nextState && nextState.ratePpm > 0 && (!percent.trim() || percent === prevAuto)) {
      setPercent(percentText(nextState.ratePpm));
    }
  }

  function submit() {
    if (nameError || (!locked && (percentError || countryError))) {
      setShowErrors(true);
      return;
    }
    const place =
      choice === OUTSIDE_US
        ? { country, jurisdiction: region.trim() || null }
        : { country: "US", jurisdiction: picked ? picked.code : null };
    const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : "Couldn't save the rate");
    if (rate) {
      update.mutate(
        { id: rate.id, name: name.trim(), ...(locked ? {} : { ...place, ratePpm: ratePpm! }) },
        { onSuccess: () => (toast.success("Rate saved"), onClose()), onError: fail }
      );
      return;
    }
    create.mutate(
      { name: name.trim(), ...place, ratePpm: ratePpm! },
      {
        onSuccess: (result) => {
          const created = result as { id?: number } | undefined;
          if (offerParts && applyToParts && created?.id) {
            setRules.mutate(
              { part: created.id },
              {
                onSuccess: () => (toast.success("Rate added and applied to Parts and goods"), onClose()),
                onError: fail,
              }
            );
          } else {
            toast.success("Rate added. Choose which lines it applies to below.");
            onClose();
          }
        },
        onError: fail,
      }
    );
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      title={rate ? `Edit ${rate.name}` : "Add a sales tax rate"}
      description="Printed on invoices beside the tax it charges."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : rate ? "Save" : "Add rate"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {prefill && choice === prefill.state.code ? (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground" data-testid="sales-tax-prefill">
            Filled in from {prefill.from}. Check it before you add it.
          </p>
        ) : null}
        <Field label="State" htmlFor="sales-tax-state">
          <Select value={choice} onValueChange={pickState} disabled={locked}>
            <SelectTrigger id="sales-tax-state" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_STATE}>No state</SelectItem>
              {settings.states.map((st) => (
                <SelectItem key={st.code} value={st.code}>
                  {st.name}
                </SelectItem>
              ))}
              <SelectItem value={OUTSIDE_US}>Outside the US</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {choice === OUTSIDE_US ? (
          <>
            <Field label="Country" htmlFor="sales-tax-country">
              <Select value={country} onValueChange={setCountry} disabled={locked}>
                <SelectTrigger id="sales-tax-country" className="w-full" aria-invalid={showErrors && countryError}>
                  <SelectValue placeholder="Pick a country" />
                </SelectTrigger>
                <SelectContent>
                  {settings.countries.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors && countryError && <p className="text-xs text-destructive">Pick the country the tax is owed in.</p>}
            </Field>
            <Field label="Region (optional)" htmlFor="sales-tax-region" hint="Printed beside the rate, for example British Columbia.">
              <Input placeholder="ID" id="sales-tax-region" value={region} onChange={(e) => setRegion(e.target.value)} maxLength={40} disabled={locked} />
            </Field>
          </>
        ) : null}
        <Field label="Name" htmlFor="sales-tax-name" hint={choice === OUTSIDE_US ? "What customers see, for example VAT or GST." : undefined}>
          <Input
            id="sales-tax-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={choice === OUTSIDE_US ? "VAT" : "Idaho sales tax"}
            maxLength={50}
            aria-invalid={showErrors && nameError}
          />
        </Field>
        <Field
          label="Rate"
          htmlFor="sales-tax-percent"
          hint={
            locked
              ? `Already on ${rate!.usedOnLines} invoice line${rate!.usedOnLines === 1 ? "" : "s"}, so only the name can change. Archive this rate and add the new one.`
              : picked
                ? picked.ratePpm > 0
                  ? `${picked.name}'s statewide rate is ${percentLabel(picked.ratePpm)} (${settings.statewideRatesSource}, ${formatAsOf(settings.statewideRatesAsOf)}). Your city or county may add more.`
                  : `${picked.name} has no statewide sales tax. Check whether your city or borough charges one.`
                : "Up to four decimal places, for example 8.1875."
          }
        >
          <div className="relative w-32">
            <Input
              id="sales-tax-percent"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="6"
              disabled={locked}
              aria-invalid={showErrors && percentError}
              className="pr-7 tnum"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
          </div>
          {showErrors && percentError && (
            <p className="text-xs text-destructive">Enter a rate above 0% and no more than 30%.</p>
          )}
        </Field>
        {offerParts ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={applyToParts}
              onCheckedChange={(v) => setApplyToParts(v === true)}
              aria-label="Apply this rate to Parts and goods"
              className="mt-0.5"
            />
            <span>
              Apply it to Parts and goods
              <span className="block text-xs text-muted-foreground">
                The usual rule: parts are taxed, labor on its own line is not. Change it any time under What gets taxed.
              </span>
            </span>
          </label>
        ) : null}
      </div>
    </ResponsiveModal>
  );
}

/** "2026-01-01" -> "1 January 2026". */
function formatAsOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
