import { useState } from "react";
import { Archive, ArchiveRestore, BadgeCheck, Pencil, Plus, Users } from "lucide-react";
import type { DuesInterval, MembershipPlan } from "@/types/api";
import {
  useArchiveMembershipPlan,
  useCreateMembershipPlan,
  useDocumentTypes,
  useMembershipPlanRates,
  useMembershipPlans,
  useResources,
  useSetMembershipPlanRate,
  useUpdateMembershipPlan,
} from "@/features/queries";
import { formatMoney } from "@/lib/utils";
import { DUES_INTERVAL_LABEL, DUES_INTERVAL_SUFFIX, planPriceLine } from "@/lib/membership";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveModal } from "@/components/responsive-modal";
import { EmptyState } from "@/components/states";
import { PreferenceToggle } from "@/components/settings/parts";

/** `invoice_item.name` is VarChar(60) and the server refuses more. */
const LABEL_MAX = 60;

/**
 * Membership plans — what this organization charges people for BELONGING.
 *
 * Tiers are plans, not settings. Full, associate, family, social, non-flying, student rate:
 * every club's list is different, and every one of them is another row here rather than
 * another checkbox. That is why this screen is a list with an Add button and not a form.
 *
 * Editing a price is deliberately unguarded. Every membership snapshots what it costs at
 * the moment it starts, so raising the price here cannot re-price anybody already on the
 * plan — the same reason a published course's fee stays editable. Moving an existing member
 * to today's price is "Change plan" on their record, which is a separate, deliberate act.
 */
export function MembershipsTab() {
  const plans = useMembershipPlans(true);
  const [editing, setEditing] = useState<MembershipPlan | "new" | null>(null);
  const archive = useArchiveMembershipPlan();

  const live = (plans.data ?? []).filter((p) => !p.archivedAt);
  const retired = (plans.data ?? []).filter((p) => p.archivedAt);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-base font-medium">
            Membership plans
            <DocsHint topic="membership-dues" />
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            What people pay to join and to stay. A plan can have a one-time join fee, recurring
            dues, or both. Add a plan per tier — full, associate, social — and put each member on
            one from their record.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="mr-1.5 size-4" />
          Add plan
        </Button>
      </div>

      {plans.isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading plans…</Card>
      ) : live.length === 0 && retired.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="No membership plans yet"
          body="Clubs and FBOs use these to charge dues and a join fee. Nothing changes for anyone until you put a member on a plan."
          action={<Button onClick={() => setEditing("new")}>Add your first plan</Button>}
        />
      ) : (
        <div className="space-y-3" data-doc-shot="memberships-plans-list">
          {live.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              onEdit={() => setEditing(plan)}
              onArchive={() => archive.mutate({ planId: plan.id, archived: true })}
              busy={archive.isPending}
            />
          ))}

          {retired.length > 0 && (
            <div className="pt-2">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Retired
              </p>
              {retired.map((plan) => (
                <PlanRow
                  key={plan.id}
                  plan={plan}
                  onEdit={() => setEditing(plan)}
                  onArchive={() => archive.mutate({ planId: plan.id, archived: false })}
                  busy={archive.isPending}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {archive.error ? (
        <p className="text-sm text-destructive">{(archive.error as Error).message}</p>
      ) : null}

      {editing ? (
        <PlanEditor plan={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function PlanRow({
  plan,
  onEdit,
  onArchive,
  busy,
}: {
  plan: MembershipPlan;
  onEdit: () => void;
  onArchive: () => void;
  busy: boolean;
}) {
  const retired = !!plan.archivedAt;

  return (
    <Card className={`p-4 ${retired ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium">{plan.name}</h3>
            {retired ? <Badge variant="outline">Retired</Badge> : null}
            {plan.autoBillDues && !retired ? <Badge variant="secondary">Auto-billed</Badge> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{planPriceLine(plan)}</p>
          {plan.description ? (
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">{plan.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {plan.memberCount} {plan.memberCount === 1 ? "member" : "members"}
            </span>
            {plan.duesCents ? (
              <span>
                {plan.duesDayOfMonth
                  ? `Billed on the ${ordinal(plan.duesDayOfMonth)}`
                  : "Billed on each member's own anniversary"}
              </span>
            ) : null}
            {plan.prorateFirstPeriod ? <span>First period prorated</span> : null}
            {plan.duesDueInDays ? <span>Due in {plan.duesDueInDays} days</span> : null}
            {plan.bookingWindowDays ? <span>Books {plan.bookingWindowDays} days ahead</span> : null}
            {plan.agreementDocumentType ? (
              <span>Agreement: {plan.agreementDocumentType.name}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="mr-1.5 size-3.5" />
            Edit
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={onArchive}>
            {retired ? (
              <>
                <ArchiveRestore className="mr-1.5 size-3.5" />
                Restore
              </>
            ) : (
              <>
                <Archive className="mr-1.5 size-3.5" />
                Retire
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

const ordinal = (n: number) => {
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix}`;
};

/** Dollars in the box, cents on the wire. Rounded, never truncated — see CourseFeeEditor. */
const toCents = (dollars: string): number | null => {
  const trimmed = dollars.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
};

const toDollars = (cents: number | null | undefined): string =>
  cents != null ? (cents / 100).toFixed(2) : "";

function PlanEditor({ plan, onClose }: { plan: MembershipPlan | null; onClose: () => void }) {
  const create = useCreateMembershipPlan();
  const update = useUpdateMembershipPlan();
  //Any document type can stand as the plan's agreement. Nothing is enforced on it — see
  //the note under the field.
  const documentTypes = useDocumentTypes();

  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [joinFee, setJoinFee] = useState(toDollars(plan?.joinFeeCents));
  const [joinFeeLabel, setJoinFeeLabel] = useState(plan?.joinFeeLabel ?? "");
  const [dues, setDues] = useState(toDollars(plan?.duesCents));
  const [duesLabel, setDuesLabel] = useState(plan?.duesLabel ?? "");
  const [interval, setInterval] = useState<DuesInterval>(plan?.duesInterval ?? "monthly");
  const [billingDay, setBillingDay] = useState<string>(
    plan?.duesDayOfMonth != null ? String(plan.duesDayOfMonth) : "1"
  );
  const [anniversary, setAnniversary] = useState(plan ? plan.duesDayOfMonth == null : false);
  const [prorate, setProrate] = useState(plan?.prorateFirstPeriod ?? true);
  const [autoBill, setAutoBill] = useState(plan?.autoBillDues ?? false);
  const [dueDays, setDueDays] = useState(plan?.duesDueInDays != null ? String(plan.duesDueInDays) : "");
  const [windowDays, setWindowDays] = useState(
    plan?.bookingWindowDays != null ? String(plan.bookingWindowDays) : ""
  );
  const [agreementTypeId, setAgreementTypeId] = useState<string>(
    plan?.FK_agreementDocumentTypeId != null ? String(plan.FK_agreementDocumentTypeId) : "none"
  );

  const duesCents = toCents(dues);
  const joinFeeCents = toCents(joinFee);
  const busy = create.isPending || update.isPending;
  const error = (create.error ?? update.error) as Error | undefined;

  const nameInvalid = !name.trim();
  const duesTyped = dues.trim() !== "";
  const joinTyped = joinFee.trim() !== "";
  const amountInvalid = (duesTyped && duesCents == null) || (joinTyped && joinFeeCents == null);

  const submit = () => {
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      joinFeeCents,
      joinFeeLabel: joinFeeLabel.trim() || null,
      duesCents,
      duesLabel: duesLabel.trim() || null,
      duesInterval: interval,
      //An anniversary cycle is the absence of a fixed day, which is what null means on the
      //server. Sending 0 or "" would be read as a day.
      duesDayOfMonth: anniversary ? null : Number(billingDay),
      prorateFirstPeriod: !anniversary && prorate,
      autoBillDues: autoBill,
      //Blank means "no due date" and "no limit" respectively — both are real values the
      //server stores as null, not omissions.
      duesDueInDays: dueDays.trim() === "" ? null : Math.max(1, Number(dueDays)),
      bookingWindowDays: windowDays.trim() === "" ? null : Math.max(1, Number(windowDays)),
      agreementDocumentTypeId: agreementTypeId === "none" ? null : Number(agreementTypeId),
    };

    const done = { onSuccess: () => onClose() };
    if (plan) update.mutate({ planId: plan.id, ...body }, done);
    else create.mutate(body, done);
  };

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && onClose()}
      title={plan ? "Edit plan" : "New membership plan"}
      description="Members already on this plan keep the price they joined at."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || nameInvalid || amountInvalid}>
            {busy ? "Saving…" : plan ? "Save plan" : "Create plan"}
          </Button>
        </>
      }
    >
      <div className="space-y-5" data-doc-shot="membership-plan-editor">
        <div className="space-y-2">
          <Label htmlFor="plan-name">Plan name</Label>
          <Input
            id="plan-name"
            maxLength={LABEL_MAX}
            placeholder="Full member"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="plan-description">Description</Label>
          <Textarea
            id="plan-description"
            rows={2}
            maxLength={500}
            placeholder="Full flying privileges on the whole fleet."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* --- Join fee ------------------------------------------------------------- */}
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <h3 className="text-sm font-medium">Join fee</h3>
            <p className="text-xs text-muted-foreground">
              Charged once, when somebody joins. Leave empty if there is none.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <MoneyField id="plan-join-fee" label="Amount" value={joinFee} onChange={setJoinFee} />
            <div className="min-w-[14rem] flex-1 space-y-1">
              <Label htmlFor="plan-join-label">How it reads on the invoice</Label>
              <Input
                id="plan-join-label"
                maxLength={LABEL_MAX}
                placeholder={`${name.trim() || "Plan"} membership fee`}
                value={joinFeeLabel}
                onChange={(e) => setJoinFeeLabel(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* --- Dues ------------------------------------------------------------------ */}
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <h3 className="text-sm font-medium">Dues</h3>
            <p className="text-xs text-muted-foreground">
              Charged every period for as long as the membership is active. Leave empty for a
              plan with no ongoing cost.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <MoneyField id="plan-dues" label="Amount" value={dues} onChange={setDues} />
            <div className="space-y-1">
              <Label htmlFor="plan-interval">Every</Label>
              <Select value={interval} onValueChange={(v) => setInterval(v as DuesInterval)}>
                <SelectTrigger id="plan-interval" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DUES_INTERVAL_LABEL) as DuesInterval[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {DUES_INTERVAL_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[12rem] flex-1 space-y-1">
              <Label htmlFor="plan-dues-label">How it reads on the invoice</Label>
              <Input
                id="plan-dues-label"
                maxLength={LABEL_MAX}
                placeholder={`${name.trim() || "Plan"} dues`}
                value={duesLabel}
                onChange={(e) => setDuesLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="divide-y">
            <PreferenceToggle
              label="Bill everyone on the same day"
              description="Most clubs do. Turn this off to bill each member on their own join anniversary instead, which suits rolling sign-ups."
              checked={!anniversary}
              onCheckedChange={(v) => setAnniversary(!v)}
            />

            {!anniversary && (
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <Label htmlFor="plan-billing-day" className="text-sm font-medium">
                    Billing day
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    1 to 28, so every month has one.
                  </p>
                </div>
                <Input
                  id="plan-billing-day"
                  className="w-20"
                  inputMode="numeric"
                  value={billingDay}
                  onChange={(e) => setBillingDay(e.target.value.replace(/\D/g, "").slice(0, 2) || "1")}
                  onBlur={() =>
                    setBillingDay(String(Math.min(Math.max(Number(billingDay) || 1, 1), 28)))
                  }
                />
              </div>
            )}

            {!anniversary && (
              <PreferenceToggle
                label="Prorate the first period"
                description="Somebody joining part-way through a cycle pays for the days they actually get, then a full amount from the next one."
                checked={prorate}
                onCheckedChange={setProrate}
              />
            )}

            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <Label htmlFor="plan-due-days" className="text-sm font-medium">
                  Days to pay
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {dueDays.trim() === ""
                    ? "No due date. Reminders start a week after the invoice is raised."
                    : `Dues and the joining fee are due ${dueDays} days after they are billed. Overdue invoices can ground a member — that threshold is on the Billing screen.`}
                </p>
              </div>
              <Input
                id="plan-due-days"
                className="w-20"
                inputMode="numeric"
                placeholder="None"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
              />
            </div>

            <PreferenceToggle
              label="Bill dues automatically"
              description="Raise each period's invoice on its own, overnight. Leave off to bill by hand from each member's record. Existing members keep whatever they are set to now."
              checked={autoBill}
              onCheckedChange={setAutoBill}
            />
          </div>

          {duesCents ? (
            <p className="text-xs text-muted-foreground">
              A member on this plan is billed {formatMoney(duesCents)}
              {DUES_INTERVAL_SUFFIX[interval]}
              {autoBill ? ", raised automatically" : ", when you bill it"}.
            </p>
          ) : null}
        </div>

        {/* --- Entitlements ------------------------------------------------------------ */}
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <h3 className="text-sm font-medium">What this tier allows</h3>
            <p className="text-xs text-muted-foreground">
              Unlike the prices above, these apply to everyone on the tier as soon as you save
              them — including members who joined years ago.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="plan-window" className="text-sm font-medium">
                Booking window
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {windowDays.trim() === ""
                  ? "No limit. Members on this tier can book as far ahead as anyone."
                  : `Members can book up to ${windowDays} days ahead. The classic club rule: full members book the season, associates book inside a week.`}
              </p>
            </div>
            <Input
              id="plan-window"
              className="w-20"
              inputMode="numeric"
              placeholder="None"
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
          </div>

          {plan ? (
            <PlanRateEditor planId={plan.id} />
          ) : (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Save the plan first, then set per-aircraft rates for it.
            </p>
          )}
        </div>

        {/* --- Agreement -------------------------------------------------------------- */}
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="plan-agreement">Membership agreement</Label>
          <Select value={agreementTypeId} onValueChange={setAgreementTypeId}>
            <SelectTrigger id="plan-agreement">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {(documentTypes.data ?? []).map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Which document a member on this plan is meant to have on file. AerScheduler does not
            collect signatures yet, so this is a reminder on their record, not a requirement —
            nothing is blocked if it is missing.
          </p>
        </div>

        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          id={id}
          className="w-36 pl-5"
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * Per-aircraft rates for one tier.
 *
 * The thing that turns a tier from a price into a membership: full members fly the 172 at
 * $150, associates at $175. Deliberately SPARSE — an empty box means "bill this tail as
 * published", which is what every aircraft did before tiers existed, so a club only fills in
 * the rows it actually disagrees with.
 *
 * Only aircraft are listed. Simulators and rooms price from their own cost rows and there is
 * no tier override for them, so showing them here would offer a control that does nothing.
 */
function PlanRateEditor({ planId }: { planId: number }) {
  const resources = useResources();
  const rates = useMembershipPlanRates(planId);
  const save = useSetMembershipPlanRate();

  const planes = (resources.data ?? []).filter((r) => r.type?.plane != null);

  if (resources.isLoading || rates.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading aircraft…</p>;
  }
  if (planes.length === 0) {
    return <p className="text-xs text-muted-foreground">No aircraft yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">Aircraft rates</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Leave blank to bill this tier at the aircraft&rsquo;s own rate. A rate here applies
          when everyone being billed on a booking is on the same tier.
        </p>
      </div>

      <div className="divide-y rounded-lg border">
        {planes.map((plane) => (
          <PlanRateRow
            key={plane.id}
            planId={planId}
            resourceId={plane.id}
            label={plane.type?.plane?.tailNumber ?? `Aircraft ${plane.id}`}
            publishedCents={plane.type?.plane?.cost?.wetRate ?? plane.type?.plane?.cost?.dryRate ?? null}
            current={rates.data?.find((r) => r.resourceId === plane.id) ?? null}
            onSave={(cents) =>
              save.mutate({
                planId,
                resourceId: plane.id,
                //Written to the WET rate, matching the precedence the pricing path uses —
                //wet wins over dry, so a single figure here is unambiguous.
                wetRate: cents,
                dryRate: null,
              })
            }
            saving={save.isPending}
          />
        ))}
      </div>

      {save.error ? <p className="text-sm text-destructive">{(save.error as Error).message}</p> : null}
    </div>
  );
}

function PlanRateRow({
  label,
  publishedCents,
  current,
  onSave,
  saving,
}: {
  planId: number;
  resourceId: number;
  label: string;
  publishedCents: number | null;
  current: { dryRate: number | null; wetRate: number | null } | null;
  onSave: (cents: number | null) => void;
  saving: boolean;
}) {
  const existing = current?.wetRate ?? current?.dryRate ?? null;
  const [text, setText] = useState(existing != null ? (existing / 100).toFixed(2) : "");

  const parsed = text.trim() === "" ? null : Math.round(Number.parseFloat(text) * 100);
  const invalid = parsed != null && (!Number.isFinite(parsed) || parsed <= 0);
  const dirty = parsed !== existing;

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {publishedCents != null ? `Published ${formatMoney(publishedCents)}/hr` : "No published rate"}
          {existing != null ? ` · this tier pays ${formatMoney(existing)}/hr` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
          <Input
            className="w-28 pl-5"
            inputMode="decimal"
            placeholder="Published"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || invalid || saving}
          onClick={() => onSave(parsed)}
        >
          {parsed == null && dirty ? "Clear" : "Set"}
        </Button>
      </div>
    </div>
  );
}
