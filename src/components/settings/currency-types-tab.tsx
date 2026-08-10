import * as React from "react";
import { format, parseISO } from "date-fns";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  FileCheck2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { pageRows, useCreateCurrencyType, useCurrencyTypesPage, useDeleteCurrencyType, useDocumentTypes, useOrgUserGroup, useOrgUserGroups, useResourceGroup, useResourceGroups, useUpdateCurrencyType } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import type { CurrencyType, CurrencyTypeInput } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { DatePickerField } from "@/components/date-picker";
import { EmptyState, ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

const WARN_BOX =
  "flex items-start gap-2.5 rounded-lg border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)] p-3 text-sm";
const WARN_ICON =
  "mt-0.5 size-4 shrink-0 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]";
const WARN_TEXT = "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]";
const INFO_BOX = "rounded-lg border border-border bg-muted/40 p-3 text-sm";

// ── Reading a rule ───────────────────────────────────────────────────────────

type ExpiryMode = "never" | "days" | "months" | "on";

/**
 * Which expiry rule the SERVER will actually apply.
 *
 * `calculateExpirationDate` takes the first non-null of expiresOn → expiresInDays
 * → expiresInMonths. It is a precedence, NOT "whichever comes first", so when more
 * than one is stored the losers are dead data. We always display the winner.
 */
function effectiveExpiryMode(t: CurrencyType): ExpiryMode {
  if (t.expiresOn) return "on";
  if (t.expiresInDays) return "days";
  if (t.expiresInMonths) return "months";
  return "never";
}

/** How many expiry values are stored, more than one means some are being ignored. */
function storedExpiryRules(t: CurrencyType): number {
  return [t.expiresOn, t.expiresInDays, t.expiresInMonths].filter(Boolean).length;
}

/** The rule's expiry in one phrase, e.g. "Expires 24 months after sign-off". */
function expirySummary(t: CurrencyType): string {
  switch (effectiveExpiryMode(t)) {
    case "on":
      return `Expires ${formatDay(t.expiresOn!)}`;
    case "days":
      return `Expires ${t.expiresInDays} ${plural(t.expiresInDays!, "day")} after sign-off`;
    case "months":
      return `Expires ${t.expiresInMonths} ${plural(t.expiresInMonths!, "month")} after sign-off`;
    default:
      return (t.documentTypes?.length ?? 0) > 0
        ? "Expires with the documents"
        : "Never expires";
  }
}

/**
 * Why a rule is inert, in one sentence, or null when it actually gates something.
 *
 * BOTH relations are load-bearing. `orgUserIsCurrentForResource` matches currencies
 * through `currencyType.resourceGroups.resources.id`, so with no aircraft group it
 * matches nothing; and currency records only ever exist because a people group put
 * them there (there is no endpoint to create one for an individual), so with no
 * people group there is nothing to match either. Either gap = enforces nothing.
 */
function scopeGapText(aircraftGroups: number, peopleGroups: number): string | null {
  if (!aircraftGroups && !peopleGroups)
    return "No aircraft groups and no people groups, nobody is tracked against this rule and it covers no aircraft, so it never blocks a booking.";
  if (!aircraftGroups)
    return "No aircraft groups. This rule covers no aircraft, so lapsing on it never blocks a booking.";
  if (!peopleGroups)
    return "No people groups, nobody gets a record for this rule, so there is never a lapse to block. People groups are the only way records are created.";
  return null;
}

function plural(n: number, word: string) {
  return n === 1 ? word : `${word}s`;
}

function countOfPeople(n: number) {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** "aircraft" is its own plural, and the group can hold rooms and sims too. */
function countOfResources(n: number) {
  return `${n} ${n === 1 ? "resource" : "resources"}`;
}

/** Format an ISO date without letting the local timezone shift the calendar day. */
function formatDay(iso: string) {
  const d = parseISO(iso.slice(0, 10));
  return Number.isNaN(d.getTime()) ? iso : format(d, "MMM d, yyyy");
}

// ── Tab ──────────────────────────────────────────────────────────────────────

/**
 * Currency rules: the gate that stops a lapsed pilot from booking. The server checks
 * these when a reservation is created (not at ramp-out), and a rule only bites when it
 * names both aircraft groups and people groups, so this tab leads with that.
 */
export function CurrencyTypesTab() {
  const paging = usePaging();
  const q = useCurrencyTypesPage(paging);
  const del = useDeleteCurrencyType();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CurrencyType | null>(null);

  const { rows: types, total } = pageRows(q);
  const inert = types.filter(
    (t) => !(t.resourceGroups?.length && t.orgUserGroups?.length)
  ).length;

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(type: CurrencyType) {
    setEditing(type);
    setFormOpen(true);
  }

  async function remove(type: CurrencyType) {
    const ok = await confirm({
      title: `Delete "${type.name}"?`,
      // Verified server behaviour: DELETE soft-deletes the type AND archives every
      // currency record filed under it, and every later verb on that id 403s, there
      // is no way back through the API.
      description:
        "This can't be undone from the console. Everyone's record for this rule is archived (their sign-off history stops being visible) and nobody is gated by it any more.",
      confirmLabel: "Delete rule",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(type.id, {
      onSuccess: () => toast.success(`"${type.name}" deleted.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't delete this rule.")),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <CardTitle>Currency rules</CardTitle>
            <CardDescription>
              What people must stay signed off on before they can book, medicals,
              flight reviews, checkouts.
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" /> Add rule
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Gate on isPending, never isLoading: a pending-but-not-fetching query has
            isLoading === false and would fall straight through to the empty state. */}
        {q.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : total === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No currency rules yet"
            body="A rule blocks bookings for anyone who isn't signed off on it, a medical for every renter, a checkout before the complex singles."
            action={
              <Button size="sm" onClick={openAdd}>
                <Plus className="size-4" /> Add rule
              </Button>
            }
          />
        ) : (
          <>
            {inert > 0 && (
              <div className="px-4 pb-3">
                <div className={WARN_BOX}>
                  <AlertTriangle className={WARN_ICON} />
                  <p className="text-foreground">
                    <span className="font-medium">
                      {inert} of {types.length} {plural(types.length, "rule")}{" "}
                      {inert === 1 ? "isn't" : "aren't"} enforcing anything.
                    </span>{" "}
                    A rule only blocks a booking once it names both the aircraft groups
                    it covers and the people groups it applies to. Until then it is
                    stored but inactive in practice.
                  </p>
                </div>
              </div>
            )}
            <ul className="divide-y divide-border">
              {types.map((t) => (
                <TypeRow key={t.id} type={t} onEdit={openEdit} onDelete={remove} />
              ))}
            </ul>
          </>
        )}
        <TablePagination
          paging={paging}
          total={total}
          returned={types.length}
          loading={q.isFetching}
          className="px-1"
        />
      </CardContent>

      <CurrencyTypeFormModal open={formOpen} onOpenChange={setFormOpen} type={editing} />
    </Card>
  );
}

function TypeRow({
  type,
  onEdit,
  onDelete,
}: {
  type: CurrencyType;
  onEdit: (type: CurrencyType) => void;
  onDelete: (type: CurrencyType) => void;
}) {
  // The list endpoint already returns all three scope relations as {id, name}.
  // no per-row detail fetch is needed to describe what a rule covers.
  const aircraft = type.resourceGroups ?? [];
  const people = type.orgUserGroups ?? [];
  const docs = type.documentTypes ?? [];
  const gap = scopeGapText(aircraft.length, people.length);
  const extraExpiryRules = storedExpiryRules(type) > 1;

  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{type.name}</span>
          {gap && (
            <Badge variant="danger">
              <AlertTriangle className="size-3" /> Enforces nothing
            </Badge>
          )}
          {type.active === false && <Badge variant="secondary">Inactive</Badge>}
          <Badge variant="outline">
            {expirySummary(type)}
            {type.warningPeriodInDays != null &&
              effectiveExpiryMode(type) !== "never" &&
              ` · warn ${type.warningPeriodInDays}d ahead`}
          </Badge>
          {type.canFlyWithInstructor && (
            <Badge variant="secondary">Instructor override</Badge>
          )}
          {extraExpiryRules && (
            <Badge variant="warning">Extra expiry values stored (ignored)</Badge>
          )}
        </div>

        {type.description && (
          <p className="text-xs text-muted-foreground">{type.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <ScopeLine icon={Plane} label="Aircraft" names={aircraft.map((g) => g.name)} />
          <ScopeLine icon={Users} label="People" names={people.map((g) => g.name)} />
          {docs.length > 0 && (
            <ScopeLine
              icon={FileCheck2}
              label="Documents"
              names={docs.map((d) => d.name)}
            />
          )}
        </div>

        {gap && (
          <p className={`text-xs ${WARN_TEXT}`}>
            {gap}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => onEdit(type)}
            >
              Fix the scope
            </button>
          </p>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${type.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => onEdit(type)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void onDelete(type)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function ScopeLine({
  icon: Icon,
  label,
  names,
}: {
  icon: LucideIcon;
  label: string;
  names: string[];
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      <span className={names.length === 0 ? WARN_TEXT : undefined}>
        {label}: {names.length === 0 ? "none" : names.join(", ")}
      </span>
    </span>
  );
}

// ── Form ─────────────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  description: string;
  expiryMode: ExpiryMode;
  expiresInDays: string;
  expiresInMonths: string;
  /** "yyyy-MM-dd", what DatePickerField speaks. */
  expiresOn: string;
  warningPeriodInDays: string;
  canFlyWithInstructor: boolean;
  instructorCanRenew: boolean;
  dispatcherCanRenew: boolean;
  canRenewSelf: boolean;
  resourceGroupIds: number[];
  orgUserGroupIds: number[];
  documentTypeIds: number[];
};

/** Required fields, in focus order, mapped to their input ids for error focus. */
const REQUIRED_FIELDS = [
  { key: "name", id: "ct-name" },
  { key: "expiresInDays", id: "ct-days" },
  { key: "expiresInMonths", id: "ct-months" },
  { key: "expiresOn", id: "ct-on" },
  { key: "warningPeriodInDays", id: "ct-warning" },
] as const;

const EXPIRY_MODES: { value: ExpiryMode; label: string; hint: string }[] = [
  {
    value: "never",
    label: "Never, a one-time sign-off",
    hint: "Right for a checkout or an endorsement: once signed off it stays good until someone archives it.",
  },
  {
    value: "days",
    label: "A number of days after sign-off",
    hint: "Counted from the date the sign-off starts, not from today.",
  },
  {
    value: "months",
    label: "A number of months after sign-off",
    hint: "How a medical or a flight review is usually written: 24 months from the sign-off date.",
  },
  {
    value: "on",
    label: "On one fixed calendar date",
    hint: "The same date for everybody. Once that date passes every new sign-off expires the moment it is made, so move it before it lapses.",
  },
];

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    expiryMode: "never",
    expiresInDays: "",
    expiresInMonths: "",
    expiresOn: "",
    warningPeriodInDays: "30",
    // Matches the database default. Flutter's create screen defaults this ON, but a
    // rule exists to block, leniency should be a decision, especially given that the
    // server applies it across every rule the pilot is lapsed on (see the helper text).
    canFlyWithInstructor: false,
    instructorCanRenew: false,
    dispatcherCanRenew: false,
    canRenewSelf: false,
    resourceGroupIds: [],
    orgUserGroupIds: [],
    documentTypeIds: [],
  };
}

function formFromType(t: CurrencyType): FormState {
  return {
    name: t.name,
    description: t.description ?? "",
    // Seed the mode from the rule the server would actually apply, not the first
    // field that happens to be set.
    expiryMode: effectiveExpiryMode(t),
    expiresInDays: t.expiresInDays != null ? String(t.expiresInDays) : "",
    expiresInMonths: t.expiresInMonths != null ? String(t.expiresInMonths) : "",
    expiresOn: t.expiresOn ? t.expiresOn.slice(0, 10) : "",
    warningPeriodInDays:
      t.warningPeriodInDays != null ? String(t.warningPeriodInDays) : "30",
    canFlyWithInstructor: !!t.canFlyWithInstructor,
    instructorCanRenew: !!t.instructorCanRenew,
    dispatcherCanRenew: !!t.dispatcherCanRenew,
    canRenewSelf: !!t.canRenewSelf,
    resourceGroupIds: (t.resourceGroups ?? []).map((g) => g.id),
    orgUserGroupIds: (t.orgUserGroups ?? []).map((g) => g.id),
    documentTypeIds: (t.documentTypes ?? []).map((d) => d.id),
  };
}

function positiveInt(s: string): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function digitsOnly(s: string) {
  return s.replace(/[^0-9]/g, "").slice(0, 4);
}

function sameIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false;
  const sortedB = [...b].sort((x, y) => x - y);
  return [...a].sort((x, y) => x - y).every((v, i) => v === sortedB[i]);
}

function CurrencyTypeFormModal({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: CurrencyType | null;
}) {
  const isEdit = !!type;
  const create = useCreateCurrencyType();
  const update = useUpdateCurrencyType();
  const pending = create.isPending || update.isPending;

  const resourceGroups = useResourceGroups({ enabled: open });
  const orgUserGroups = useOrgUserGroups({ enabled: open });
  const documentTypes = useDocumentTypes({ enabled: open });

  const [form, setForm] = React.useState<FormState>(emptyForm);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);
  // Second-press acknowledgement, see handleSubmit.
  const [confirming, setConfirming] = React.useState(false);

  // Reset whenever the modal opens (fresh add, or prefilled edit). The list payload
  // already carries every field and all three relations, so there is nothing to wait for.
  React.useEffect(() => {
    if (!open) return;
    setForm(type ? formFromType(type) : emptyForm());
    setShowErrors(false);
    setConfirming(false);
  }, [open, type]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    // Any edit invalidates a pending "yes I meant it", the consequences may differ now.
    setConfirming(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const days = positiveInt(form.expiresInDays);
  const months = positiveInt(form.expiresInMonths);
  const warning = positiveInt(form.warningPeriodInDays);
  const expires = form.expiryMode !== "never";
  const today = format(new Date(), "yyyy-MM-dd");

  // Per-field validity, derived every render so inline messages clear as you type.
  const errors: Record<string, string> = {
    // The server accepts an empty name and creates a nameless rule, so the check
    // has to live here.
    name: form.name.trim().length === 0 ? "Enter a name." : "",
    // 0 is stored but read as "no rule" server-side, and a negative produces a
    // date in the past, neither is ever what someone meant.
    expiresInDays:
      form.expiryMode === "days" && !days ? "Enter a whole number of days, 1 or more." : "",
    expiresInMonths:
      form.expiryMode === "months" && !months
        ? "Enter a whole number of months, 1 or more."
        : "",
    expiresOn:
      form.expiryMode === "on"
        ? !form.expiresOn
          ? "Pick the date this expires on."
          : form.expiresOn <= today
            ? "Pick a future date, a date that has passed expires every sign-off the moment it's made."
            : ""
        : "",
    warningPeriodInDays:
      expires && !warning ? "Enter how many days ahead to warn people." : "",
  };
  const firstInvalid = REQUIRED_FIELDS.find((f) => errors[f.key]);

  const peopleGroupCount = form.orgUserGroupIds.length;
  const gap = scopeGapText(form.resourceGroupIds.length, peopleGroupCount);

  const peopleChanged =
    isEdit && !!type && !sameIds(form.orgUserGroupIds, (type.orgUserGroups ?? []).map((g) => g.id));
  const docsChanged =
    isEdit && !!type && !sameIds(form.documentTypeIds, (type.documentTypes ?? []).map((d) => d.id));

  /**
   * What pressing Save does to people RIGHT NOW, beyond storing the rule. Empty for an
   * ordinary edit; non-empty means the second press is required (see handleSubmit).
   */
  const consequences: string[] = [];
  if (gap) {
    consequences.push(
      `${gap} You can still save it, it just won't gate anything until the scope is filled in.`
    );
  }
  if (!isEdit && peopleGroupCount > 0) {
    consequences.push(
      "Everyone in those people groups gets a record straight away, marked not signed off. Until each of them is signed off they can't book the aircraft this rule covers, and nobody is notified."
    );
  }
  if (docsChanged && peopleGroupCount > 0) {
    consequences.push(
      "Changing the required documents clears every existing sign-off on this rule, everyone it covers goes back to not signed off at once."
    );
  }
  if (peopleChanged) {
    consequences.push(
      "Anyone newly covered starts out not signed off; anyone dropped loses their record for this rule, and its history, from view."
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (firstInvalid) {
      setShowErrors(true);
      setConfirming(false);
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }
    // Saving can silently ground a whole group, or save a rule that gates nothing.
    // Rather than block it (the server allows both, and both are sometimes what you
    // want), spell out what happens and ask for a second, deliberate press. Done
    // inline rather than through useConfirm because this form is itself inside a
    // focus-trapped dialog.
    if (consequences.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }

    const name = form.name.trim();
    const input: CurrencyTypeInput = {
      name,
      // "" not null: PATCH maps description with `?? undefined`, so sending null is a
      // silent no-op and the description could never be cleared.
      description: form.description.trim(),
      // All three expiry fields go on every save, with explicit nulls for the modes
      // not chosen. PATCH writes these raw, so omitting one leaves the old value live
      // and the rule quietly keeps two expiry rules (the server then picks by
      // precedence, not by which one the admin last touched).
      expiresInDays: form.expiryMode === "days" ? days : null,
      expiresInMonths: form.expiryMode === "months" ? months : null,
      // Pin to UTC midnight of the chosen calendar day so the stored date is the day
      // that was picked, whatever the browser's offset.
      expiresOn: form.expiryMode === "on" ? `${form.expiresOn}T00:00:00.000Z` : null,
      warningPeriodInDays: expires ? warning : null,
      canFlyWithInstructor: form.canFlyWithInstructor,
      instructorCanRenew: form.instructorCanRenew,
      dispatcherCanRenew: form.dispatcherCanRenew,
      canRenewSelf: form.canRenewSelf,
      // Relations are a full replace server-side, and re-sending an identical set is
      // a verified no-op, so always sending all three is both correct and simplest.
      resourceGroupIds: form.resourceGroupIds,
      orgUserGroupIds: form.orgUserGroupIds,
      documentTypeIds: form.documentTypeIds,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? `"${name}" updated.` : `"${name}" created.`);
        onOpenChange(false);
      },
      onError: (e: unknown) =>
        // Every create/edit failure comes back as the same opaque string, so this is a
        // form-level message; it can never be mapped onto a field.
        toast.error(errMessage(e, "Couldn't save this rule.")),
    };

    // `active` is deliberately never sent on edit: it is only a list filter server-side
    // (it does NOT stop enforcement), and the list query asks for active rules only, so
    // a rule switched off would vanish from this tab while still blocking bookings.
    if (isEdit && type) update.mutate({ id: type.id, input }, done);
    else create.mutate({ ...input, active: true }, done);
  }

  const selectedDocTypes = (documentTypes.data ?? []).filter((d) =>
    form.documentTypeIds.includes(d.id)
  );
  const expiringDocTypes = selectedDocTypes.filter((d) => d.expires);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
      title={isEdit ? `Edit ${type?.name}` : "Add currency rule"}
      description="A rule stops the people it covers from booking the aircraft it covers until they're signed off."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Basics ── */}
        <Section title="Basics">
          <div className="space-y-1.5">
            <Label htmlFor="ct-name">Name</Label>
            <Input
              id="ct-name"
              autoFocus
              maxLength={60}
              placeholder="Flight Review"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={showErrors && !!errors.name}
            />
            {showErrors && errors.name ? (
              <p className="text-xs text-destructive">{errors.name}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                What people see on their currencies page and in the booking rejection.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ct-description">Description</Label>
            <Textarea
              id="ct-description"
              rows={2}
              maxLength={500}
              placeholder="What this covers, and what counts as a sign-off."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </Section>

        {/* ── Scope: the whole ballgame ── */}
        <Section
          title="Scope"
          hint="A rule needs both halves to bite: the aircraft it guards and the people it applies to."
        >
          <ScopeConsequence
            gap={gap}
            aircraftNames={namesFor(resourceGroups.data, form.resourceGroupIds)}
            peopleNames={namesFor(orgUserGroups.data, form.orgUserGroupIds)}
            canFlyWithInstructor={form.canFlyWithInstructor}
          />

          <ScopePicker
            idPrefix="ct-rg"
            label="Aircraft groups"
            hint="Lapsing on this rule blocks booking these aircraft, and only these. This is what makes the rule real."
            loading={resourceGroups.isPending}
            items={(resourceGroups.data ?? []).map((g) => ({
              id: g.id,
              name: g.name,
              description: g.description,
              meta: <ResourceGroupCount id={g.id} />,
            }))}
            selected={form.resourceGroupIds}
            onChange={(ids) => set("resourceGroupIds", ids)}
            emptyText="No aircraft groups exist yet. Create one on the Groups tab, then come back, without one this rule can't block anything."
          />

          <ScopePicker
            idPrefix="ct-oug"
            label="People groups"
            hint="Everyone in these groups is tracked against this rule. Membership is also how records get created, there is no way to add one person on their own."
            loading={orgUserGroups.isPending}
            items={(orgUserGroups.data ?? []).map((g) => ({
              id: g.id,
              name: g.name,
              description: g.description,
              meta: <OrgUserGroupCount id={g.id} />,
            }))}
            selected={form.orgUserGroupIds}
            onChange={(ids) => set("orgUserGroupIds", ids)}
            emptyText="No people groups exist yet. Create one on the Groups tab, then come back, without one nobody is tracked against this rule."
          />
        </Section>

        {/* ── Proof ── */}
        <Section
          title="Required documents"
          hint="Optional. Attach document types when a piece of paper is the proof."
        >
          <ScopePicker
            idPrefix="ct-dt"
            label="Document types"
            hint="Someone isn't signed off until a document of every type here is on file, and uploading one signs them off automatically."
            loading={documentTypes.isPending}
            items={(documentTypes.data ?? []).map((d) => ({
              id: d.id,
              name: d.name,
              description: d.description,
              meta: (
                <Badge variant={d.expires ? "outline" : "secondary"}>
                  {d.expires ? "carries an expiry date" : "never expires"}
                </Badge>
              ),
            }))}
            selected={form.documentTypeIds}
            onChange={(ids) => set("documentTypeIds", ids)}
            emptyText="No document types exist yet. Create them on the Document types tab if you want paperwork to be the proof."
          />

          {selectedDocTypes.length > 0 && (
            <div className={INFO_BOX}>
              <p className="text-muted-foreground">
                {expiringDocTypes.length > 0 ? (
                  <>
                    A document&rsquo;s own expiry date also expires the currency, so
                    whichever comes first wins. Only{" "}
                    <span className="text-foreground">
                      {expiringDocTypes.map((d) => d.name).join(", ")}
                    </span>{" "}
                    can do that, a document type without an expiry date just has to be
                    on file.
                  </>
                ) : (
                  <>
                    None of these document types carries an expiry date, so they can
                    never expire this currency on their own, they only have to be on
                    file. Set an expiry rule below if it should lapse.
                  </>
                )}
              </p>
            </div>
          )}

          {isEdit && docsChanged && (
            <p className={`text-xs ${WARN_TEXT}`}>
              Changing this list clears every existing sign-off on this rule, everyone
              it covers goes back to not signed off.
            </p>
          )}
        </Section>

        {/* ── Expiration ── */}
        <Section title="Expiration" hint="Pick one. They are alternatives, not layers.">
          <RadioGroup
            className="gap-2"
            value={form.expiryMode}
            onValueChange={(v) => set("expiryMode", v as ExpiryMode)}
          >
            {EXPIRY_MODES.map((m) => {
              const id = `ct-mode-${m.value}`;
              const selected = form.expiryMode === m.value;
              return (
                <div key={m.value} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <RadioGroupItem id={id} value={m.value} className="mt-1" />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={id} className="cursor-pointer">
                        {m.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{m.hint}</p>

                      {selected && m.value === "days" && (
                        <NumberField
                          id="ct-days"
                          suffix={plural(days ?? 2, "day")}
                          value={form.expiresInDays}
                          onChange={(v) => set("expiresInDays", v)}
                          error={showErrors ? errors.expiresInDays : ""}
                        />
                      )}
                      {selected && m.value === "months" && (
                        <NumberField
                          id="ct-months"
                          suffix={plural(months ?? 2, "month")}
                          value={form.expiresInMonths}
                          onChange={(v) => set("expiresInMonths", v)}
                          error={showErrors ? errors.expiresInMonths : ""}
                        />
                      )}
                      {selected && m.value === "on" && (
                        <div className="mt-2 space-y-1.5">
                          <DatePickerField
                            id="ct-on"
                            min={today}
                            value={form.expiresOn}
                            onChange={(v) => set("expiresOn", v)}
                            placeholder="Pick the expiry date"
                            invalid={showErrors && !!errors.expiresOn}
                          />
                          {showErrors && errors.expiresOn && (
                            <p className="text-xs text-destructive">{errors.expiresOn}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          {isEdit && type && storedExpiryRules(type) > 1 && (
            <p className={`text-xs ${WARN_TEXT}`}>
              This rule has more than one expiry value stored and the server only applies
              one of them. Saving keeps the option selected above and clears the others.
            </p>
          )}

          {expires && (
            <div className="space-y-1.5">
              <Label htmlFor="ct-warning">Warn this many days ahead</Label>
              <Input
                id="ct-warning"
                inputMode="numeric"
                className="tnum"
                placeholder="30"
                value={form.warningPeriodInDays}
                onChange={(e) => set("warningPeriodInDays", digitsOnly(e.target.value))}
                aria-invalid={showErrors && !!errors.warningPeriodInDays}
              />
              {showErrors && errors.warningPeriodInDays ? (
                <p className="text-xs text-destructive">
                  {errors.warningPeriodInDays}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The person is emailed and starts showing as &ldquo;expiring
                  soon&rdquo;. Nobody on staff is notified, and they can still book
                  normally right up to the expiry date.
                </p>
              )}
            </div>
          )}

          <SwitchRow
            id="ct-cfwi"
            label="A current instructor can carry a lapse"
            checked={form.canFlyWithInstructor}
            onChange={(v) => set("canFlyWithInstructor", v)}
            hint="A lapsed person can still be booked when a current instructor is on the flight. Note the server applies this leniency to every rule that person is lapsed on, not just this one, switching it on here can also let a lapsed medical through."
          />
        </Section>

        {/* ── Renewal ── */}
        <Section
          title="Sign-off"
          hint="Who can mark someone current. Admins always can, whatever is set here."
        >
          <SwitchRow
            id="ct-instructor-renew"
            label="Instructors can sign off"
            checked={form.instructorCanRenew}
            onChange={(v) => set("instructorCanRenew", v)}
            hint="This also lets instructors read everyone's record for this rule, not just their own. The two are the same permission server-side."
          />
          <SwitchRow
            id="ct-dispatcher-renew"
            label="Dispatchers can sign off"
            checked={form.dispatcherCanRenew}
            onChange={(v) => set("dispatcherCanRenew", v)}
            hint="Dispatchers can already see these records; this lets them stamp the sign-off too. They still can't backdate its start date, that's admin-only."
          />
          <SwitchRow
            id="ct-self-renew"
            label="People can sign themselves off"
            checked={form.canRenewSelf}
            onChange={(v) => set("canRenewSelf", v)}
            hint="Fine for something self-declared. Not appropriate where the point is that somebody else checked."
          />

          {selectedDocTypes.length > 0 && (
            <div className={INFO_BOX}>
              <p className="text-muted-foreground">
                Because this rule requires documents, uploading a matching document signs
                the currency off on its own, whoever uploaded it. These switches only
                govern signing off by hand.
              </p>
            </div>
          )}
        </Section>

        {/* Second-press acknowledgement: shown only when saving actually does something
            to people, or stores a rule that gates nothing. */}
        {confirming && consequences.length > 0 && (
          <div className={WARN_BOX}>
            <AlertTriangle className={WARN_ICON} />
            <div className="space-y-1.5 text-foreground">
              <p className="font-medium">Before you save:</p>
              <ul className="list-disc space-y-1 pl-4 text-[13px]">
                {consequences.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="text-[13px]">Press Save again to go ahead.</p>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {confirming ? "Save anyway" : isEdit ? "Save changes" : "Create rule"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ── Form pieces ──────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The plain-English reading of the rule as currently scoped. This is the answer to the
 * trap: a rule with a gap says so here, in the same words the list row will use, before
 * anyone presses Save: rather than being quietly accepted and doing nothing forever.
 */
function ScopeConsequence({
  gap,
  aircraftNames,
  peopleNames,
  canFlyWithInstructor,
}: {
  gap: string | null;
  aircraftNames: string[];
  peopleNames: string[];
  canFlyWithInstructor: boolean;
}) {
  if (gap) {
    return (
      <div className={WARN_BOX}>
        <AlertTriangle className={WARN_ICON} />
        <div className="space-y-1 text-foreground">
          <p className="font-medium">As written, this rule blocks nothing.</p>
          <p className="text-[13px]">{gap}</p>
        </div>
      </div>
    );
  }
  // The name lists come from the group queries, which can still be in flight, fall
  // back to a phrase rather than rendering "Everyone in  must be signed off".
  const people = peopleNames.length ? peopleNames.join(", ") : "the selected people groups";
  const aircraft = aircraftNames.length
    ? aircraftNames.join(", ")
    : "the selected aircraft groups";

  return (
    <div className={INFO_BOX}>
      <p className="text-muted-foreground">
        Everyone in <span className="font-medium text-foreground">{people}</span> must be
        signed off before they can book{" "}
        <span className="font-medium text-foreground">{aircraft}</span>
        {canFlyWithInstructor
          ? ", unless a current instructor is on the flight."
          : ". A lapse blocks the booking outright."}
      </p>
    </div>
  );
}

type PickerItem = {
  id: number;
  name: string;
  description?: string | null;
  meta?: React.ReactNode;
};

/** A checkbox list of groups/types, with the count of picks and an honest empty state. */
function ScopePicker({
  idPrefix,
  label,
  hint,
  items,
  loading,
  selected,
  onChange,
  emptyText,
}: {
  idPrefix: string;
  label: string;
  hint: string;
  items: PickerItem[];
  loading: boolean;
  selected: number[];
  onChange: (ids: number[]) => void;
  emptyText: string;
}) {
  function toggle(id: number, on: boolean) {
    onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>

      <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-44" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => {
              const inputId = `${idPrefix}-${i.id}`;
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={inputId}
                    checked={selected.includes(i.id)}
                    onCheckedChange={(v) => toggle(i.id, v === true)}
                  />
                  <Label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-normal">{i.name}</span>
                      {i.meta}
                    </span>
                    {i.description && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {i.description}
                      </span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * How many aircraft a group actually holds. The group list endpoint omits members, so
 * this is a per-row detail fetch, the same pattern the Groups tab already uses, and
 * the reason it matters here is that "Complex singles" could be an empty group, which
 * would leave the rule just as inert as naming no group at all.
 */
function ResourceGroupCount({ id }: { id: number }) {
  const q = useResourceGroup(id);
  const n = q.data?.resources?.length;
  if (n == null) return <Skeleton className="h-4 w-16 rounded-full" />;
  return (
    <Badge variant={n === 0 ? "warning" : "secondary"}>
      {n === 0 ? "empty group" : countOfResources(n)}
    </Badge>
  );
}

function OrgUserGroupCount({ id }: { id: number }) {
  const q = useOrgUserGroup(id);
  const n = q.data?.orgUsers?.length;
  if (n == null) return <Skeleton className="h-4 w-16 rounded-full" />;
  return (
    <Badge variant={n === 0 ? "warning" : "secondary"}>
      {n === 0 ? "empty group" : countOfPeople(n)}
    </Badge>
  );
}

function NumberField({
  id,
  suffix,
  value,
  onChange,
  error,
}: {
  id: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  error: string;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          className="tnum w-24"
          placeholder="24"
          value={value}
          onChange={(e) => onChange(digitsOnly(e.target.value))}
          aria-invalid={!!error}
          aria-label={`Expires after this many ${suffix}`}
        />
        <span className="text-sm text-muted-foreground">{suffix}</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  );
}

/** Names for a set of picked ids, in the order the source list returned them. */
function namesFor(source: { id: number; name: string }[] | undefined, ids: number[]) {
  return (source ?? []).filter((s) => ids.includes(s.id)).map((s) => s.name);
}
