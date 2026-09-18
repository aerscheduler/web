import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useConfirmQuickBooksCompany,
  useQuickBooksAccounts,
  useQuickBooksCompany,
  useQuickBooksItems,
  useQuickBooksStartDatePreview,
  useRemoveQuickBooksReceipts,
  useUpdateQuickBooksSettings,
  type QuickBooksLineCategory,
  type QuickBooksSettings,
  type QuickBooksSettingsPatch,
  type QuickBooksSetupStep,
} from "@/features/queries";
import { DocsHint } from "@/components/docs-hint";
import { addDaysToKey, CATEGORY_LABELS, CATEGORY_ORDER, formatDateKey, OWNERSHIP_OPTIONS, STEP_LABELS } from "./labels";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Save one or more answers with a toast; the settings query refetches on success. */
function useSave() {
  const update = useUpdateQuickBooksSettings();
  async function save(patch: QuickBooksSettingsPatch, success: string) {
    try {
      await update.mutateAsync(patch);
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(errMessage(err, "Could not save"));
      return false;
    }
  }
  return { save, pending: update.isPending };
}

/**
 * The setup interview. Every step is a question only the school can answer, and sync
 * refuses to post until all of them are answered: the server enforces the same list
 * (policy.ts missingSetup), this only walks the owner through it.
 */
export function QuickBooksSetup({
  row,
  onReconnect,
  reconnectDisabled,
}: {
  row: QuickBooksSettings;
  onReconnect: () => void;
  reconnectDisabled?: boolean;
}) {
  // `?? []`: during a deploy this console can briefly talk to the previous server.
  const missingList = row.missingSetup ?? [];
  const missing = new Set(missingList);
  const firstMissing = missingList[0] ?? null;

  const step = (key: QuickBooksSetupStep, n: number, body: ReactNode, summary: ReactNode) => (
    <SetupStep
      key={key}
      n={n}
      title={STEP_LABELS[key]}
      done={!missing.has(key)}
      current={firstMissing === key}
      summary={summary}
    >
      {body}
    </SetupStep>
  );

  return (
    <ol className="space-y-2">
      {step(
        "confirm_company",
        1,
        <CompanyStep row={row} onReconnect={onReconnect} reconnectDisabled={reconnectDisabled} />,
        row.companyName,
      )}
      {step(
        "books_ownership",
        2,
        <OwnershipStep row={row} />,
        OWNERSHIP_OPTIONS.find((o) => o.value === row.booksOwnershipAnswer)?.label,
      )}
      {step(
        "start_date",
        3,
        <StartDateStep row={row} />,
        row.effectiveStartDateKey ? `From ${formatDateKey(row.effectiveStartDateKey)}` : null,
      )}
      {step("income_item", 4, <IncomeStep row={row} />, row.incomeItemName)}
      {step("deposit_account", 5, <DepositStep row={row} />, row.depositAccountName)}
      {step(
        "desk_payments",
        6,
        <DeskStep row={row} />,
        row.syncDeskPayments === false
          ? "Not synced"
          : row.syncDeskPayments
            ? `Synced to ${row.deskDepositAccountName ?? "…"}`
            : null,
      )}
      {step("enable", 7, <EnableStep row={row} />, row.enabled ? "Syncing" : null)}
    </ol>
  );
}

function SetupStep({
  n,
  title,
  done,
  current,
  summary,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  current: boolean;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(current);
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);

  return (
    <li
      className={cn(
        "rounded-xl border bg-card",
        current ? "border-primary/40 ring-1 ring-primary/15" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {done ? (
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <span
            className={cn(
              "grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-semibold",
              current ? "border-primary text-primary" : "border-muted-foreground/40 text-muted-foreground",
            )}
          >
            {n}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          {done && summary ? <span className="block truncate text-xs text-muted-foreground">{summary}</span> : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="space-y-3 border-t border-border px-4 py-4">{children}</div> : null}
    </li>
  );
}

//-------------------------------------------------------------------------------------

function CompanyStep({
  row,
  onReconnect,
  reconnectDisabled,
}: {
  row: QuickBooksSettings;
  onReconnect: () => void;
  reconnectDisabled?: boolean;
}) {
  const company = useQuickBooksCompany();
  const confirm = useConfirmQuickBooksCompany();

  async function onConfirm() {
    if (!company.data) return;
    try {
      await confirm.mutateAsync(company.data.realmId);
      toast.success("Company confirmed");
    } catch (err) {
      toast.error(errMessage(err, "Could not confirm the company"));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Intuit lets you pick any company your login can see, including an accountant's client files or a separate LLC.
        Customers AerScheduler creates can never be deleted from the wrong company, so check this is the right one.
      </p>
      {company.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading the company from QuickBooks…
        </p>
      ) : company.error ? (
        <p className="text-sm text-destructive">{errMessage(company.error, "Could not read the company")}</p>
      ) : company.data ? (
        <dl className="grid max-w-lg grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Company</dt>
          <dd className="font-medium">{company.data.companyName ?? "Unnamed"}</dd>
          {company.data.legalName && company.data.legalName !== company.data.companyName ? (
            <>
              <dt className="text-muted-foreground">Legal name</dt>
              <dd>{company.data.legalName}</dd>
            </>
          ) : null}
          {company.data.location ? (
            <>
              <dt className="text-muted-foreground">Location</dt>
              <dd>{company.data.location}</dd>
            </>
          ) : null}
          {company.data.fileCreatedAt ? (
            <>
              <dt className="text-muted-foreground">Created in QuickBooks</dt>
              <dd>{formatDateKey(company.data.fileCreatedAt.slice(0, 10))}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {row.companyConfirmed ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-4" /> Confirmed
          </p>
        ) : (
          <Button onClick={() => void onConfirm()} disabled={!company.data || confirm.isPending}>
            {confirm.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yes, this is our company
          </Button>
        )}
        <Button variant="outline" onClick={onReconnect} disabled={reconnectDisabled}>
          Connect a different company
        </Button>
      </div>
    </div>
  );
}

function OwnershipStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  const selected = OWNERSHIP_OPTIONS.find((o) => o.value === row.booksOwnershipAnswer);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <DocsHint topic="quickbooks-books-ownership" /> Is anything already putting your flight revenue into this
        QuickBooks company? If it is and AerScheduler posts it too, every payment is counted twice. We can't tell from
        QuickBooks which tool made an entry, so only you can answer this.
      </p>
      <RadioGroup
        value={row.booksOwnershipAnswer ?? ""}
        onValueChange={(v) =>
          void save(
            {
              booksOwnershipAnswer: v as QuickBooksSettings["booksOwnershipAnswer"],
            },
            "Answer saved",
          )
        }
        disabled={pending}
        className="gap-2"
      >
        {OWNERSHIP_OPTIONS.map((o) => (
          <Label
            key={o.value}
            htmlFor={`qbo-own-${o.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 font-normal",
              row.booksOwnershipAnswer === o.value ? "border-primary/50 bg-primary/5" : "border-border",
            )}
          >
            <RadioGroupItem id={`qbo-own-${o.value}`} value={o.value} className="mt-0.5" />
            <span className="text-sm leading-snug">{o.label}</span>
          </Label>
        ))}
      </RadioGroup>
      {selected ? (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            selected.effect === "refuse"
              ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          {selected.hint}
        </p>
      ) : null}
    </div>
  );
}

function StartDateStep({ row }: { row: QuickBooksSettings }) {
  const update = useUpdateQuickBooksSettings();
  const remove = useRemoveQuickBooksReceipts();
  const forwardOnly = row.booksOwnershipAnswer === "bank_feed" || row.booksOwnershipAnswer === "manual";
  const minKey = useMemo(() => {
    const afterClose = row.bookCloseDateKey ? addDaysToKey(row.bookCloseDateKey, 1) : null;
    const candidates = [afterClose, forwardOnly ? row.todayKey : null].filter(Boolean) as string[];
    return candidates.sort().at(-1) ?? undefined;
  }, [row.bookCloseDateKey, forwardOnly, row.todayKey]);

  const [draft, setDraft] = useState(row.syncStartDateKey ?? row.todayKey);
  useEffect(() => {
    setDraft(row.syncStartDateKey ?? row.todayKey);
  }, [row.syncStartDateKey, row.todayKey]);

  const changed = draft !== row.syncStartDateKey;
  // The saved date is never re-judged against today's minimum: for a forward-only
  // school "today" moves on, and yesterday's saved choice is still correct.
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(draft) && (!changed || !minKey || draft >= minKey);
  const preview = useQuickBooksStartDatePreview(valid ? draft : null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeBefore, setRemoveBefore] = useState(false);
  const [typedYear, setTypedYear] = useState("");

  const p = preview.data;
  const toPostCount = p ? p.stripe.count + (row.syncDeskPayments ? p.desk.count : 0) : 0;
  const toPostCents = p ? p.stripe.totalCents + (row.syncDeskPayments ? p.desk.totalCents : 0) : 0;
  const earliestYear = p?.byYear.find((y) => y.count > 0 || (row.syncDeskPayments && y.deskCount > 0))?.year ?? null;
  const reachesPriorYear = !!earliestYear && earliestYear < row.todayKey.slice(0, 4) && toPostCount > 0;

  async function commit() {
    try {
      await update.mutateAsync({ syncStartDateKey: draft });
      if (removeBefore && (p?.alreadyPostedBefore.count ?? 0) > 0) {
        const r = await remove.mutateAsync({ beforeDateKey: draft });
        toast.success(
          `Start date saved. Removing ${r.queued} earlier receipt${r.queued === 1 ? "" : "s"} from QuickBooks.`,
        );
      } else {
        toast.success("Start date saved");
      }
      setConfirmOpen(false);
      setTypedYear("");
      setRemoveBefore(false);
    } catch (err) {
      toast.error(errMessage(err, "Could not save the start date"));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        AerScheduler posts invoices paid on or after this day, and nothing before it.
        {forwardOnly
          ? " Because your books already record this revenue, it can only start today or later."
          : " Pick today to start fresh, or an earlier day to bring history in. You will see exactly what would post before anything does."}
        {row.bookCloseDateKey
          ? ` Your QuickBooks books are closed through ${formatDateKey(row.bookCloseDateKey)}, so nothing can land on or before that date.`
          : null}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="qbo-start" className="flex items-center gap-1 text-sm">
            Start posting from <DocsHint topic="quickbooks-start-date" />
          </Label>
          <Input
            id="qbo-start"
            type="date"
            className="w-44"
            value={draft}
            min={minKey}
            aria-invalid={!valid || undefined}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={!valid || !changed || !preview.isSuccess}>
          {row.syncStartDateKey ? "Change start date" : "Use this date"}
        </Button>
      </div>
      {!valid && minKey ? <p className="text-sm text-destructive">Pick {formatDateKey(minKey)} or later.</p> : null}

      {valid && preview.isError ? (
        <p className="text-sm text-destructive">
          Couldn't count what this date would post, so it can't be saved yet. Try again in a moment.
        </p>
      ) : null}
      {valid && preview.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Counting what this would post…
        </p>
      ) : p ? (
        <div className="max-w-lg space-y-1 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <p>
            <span className="font-medium">{toPostCount.toLocaleString()}</span> paid invoice
            {toPostCount === 1 ? "" : "s"} ({formatMoney(toPostCents)}) not yet in QuickBooks would post
            {p.effectiveStartDateKey !== draft ? `, starting ${formatDateKey(p.effectiveStartDateKey)}` : ""}.
          </p>
          {p.byYear.length > 1 ? (
            <p className="text-muted-foreground">
              {p.byYear
                .map((y) => {
                  const n = y.count + (row.syncDeskPayments ? y.deskCount : 0);
                  const c = y.totalCents + (row.syncDeskPayments ? y.deskCents : 0);
                  return `${y.year}: ${n.toLocaleString()} (${formatMoney(c, { cents: false })})`;
                })
                .join(" · ")}
            </p>
          ) : null}
          {!row.syncDeskPayments && p.desk.count > 0 ? (
            <p className="text-muted-foreground">
              Plus {p.desk.count.toLocaleString()} front-desk payment
              {p.desk.count === 1 ? "" : "s"} ({formatMoney(p.desk.totalCents)}) if you choose to sync those.
            </p>
          ) : null}
          {p.alreadyPostedBefore.count > 0 ? (
            <p className="text-muted-foreground">
              {p.alreadyPostedBefore.count.toLocaleString()} receipt
              {p.alreadyPostedBefore.count === 1 ? "" : "s"} AerScheduler already posted fall before this date and will
              stay unless you remove them.
            </p>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start posting from {formatDateKey(draft)}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {toPostCount > 0
                    ? `${toPostCount.toLocaleString()} invoices (${formatMoney(toPostCents)}) will be posted to ${row.companyName ?? "your QuickBooks company"} as Sales Receipts, oldest first, over the next while.`
                    : "Nothing past-dated will post. New payments post as they come in."}
                </p>
                {reachesPriorYear ? (
                  <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    This reaches back into {earliestYear}, a year you have most likely already filed taxes for. Check
                    with your bookkeeper first.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(p?.alreadyPostedBefore.count ?? 0) > 0 ? (
            <Label className="flex items-start gap-2 font-normal">
              <Checkbox
                checked={removeBefore}
                onCheckedChange={(v) => setRemoveBefore(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                Also remove the {p!.alreadyPostedBefore.count.toLocaleString()} receipts AerScheduler already posted
                before this date ({formatMoney(p!.alreadyPostedBefore.totalCents)}).
              </span>
            </Label>
          ) : null}
          {reachesPriorYear ? (
            <div className="space-y-1">
              <Label htmlFor="qbo-type-year" className="text-sm">
                Type {earliestYear} to confirm
              </Label>
              <Input
                id="qbo-type-year"
                inputMode="numeric"
                className="w-28"
                value={typedYear}
                onChange={(e) => setTypedYear(e.target.value.trim())}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void commit();
              }}
              disabled={!p || update.isPending || remove.isPending || (reachesPriorYear && typedYear !== earliestYear)}
            >
              {update.isPending || remove.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save start date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IncomeStep({ row }: { row: QuickBooksSettings }) {
  const items = useQuickBooksItems();
  const { save, pending } = useSave();
  const [showSplit, setShowSplit] = useState(Object.keys(row.incomeItemMap ?? {}).length > 0);
  const options = items.data ?? [];
  const SAME = "__same__";

  async function setCategory(category: QuickBooksLineCategory, itemId: string) {
    const next: Partial<Record<QuickBooksLineCategory, string | null>> = {};
    for (const c of CATEGORY_ORDER) next[c] = row.incomeItemMap?.[c]?.id ?? null;
    next[category] = itemId === SAME ? null : itemId;
    await save({ incomeItemMap: next }, "Saved");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The QuickBooks Product/Service each Sales Receipt line posts to. Its income account is what shows on your Profit
        and Loss. Only Service and Non-inventory items can be used.
      </p>
      <div className="max-w-lg space-y-1">
        <Label className="text-sm">Default item</Label>
        <Select
          value={row.incomeItemId ?? undefined}
          onValueChange={(v) => void save({ incomeItemId: v }, "Income item saved")}
          disabled={items.isLoading || pending}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                items.isLoading
                  ? "Loading items from QuickBooks…"
                  : options.length === 0
                    ? "No Service items in QuickBooks yet: create one there first"
                    : "Choose an item"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
                {item.incomeAccountName ? ` → ${item.incomeAccountName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {items.error ? (
        <p className="text-sm text-destructive">{errMessage(items.error, "Could not load items")}</p>
      ) : null}

      <button
        type="button"
        className="flex items-center gap-1 text-sm font-medium text-primary"
        onClick={() => setShowSplit((v) => !v)}
        aria-expanded={showSplit}
      >
        <ChevronDown className={cn("size-4 transition-transform", showSplit && "rotate-180")} />
        Post each kind of charge to its own item
      </button>
      {showSplit ? (
        <div className="max-w-lg space-y-2">
          <p className="text-xs text-muted-foreground">
            So rental, instruction and fees show as separate lines on your Profit and Loss. Decide this before bringing
            in history: changing it later does not re-file receipts already posted.
          </p>
          {CATEGORY_ORDER.map((c) => (
            <div key={c} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_16rem] sm:gap-3">
              <span className="text-sm">{CATEGORY_LABELS[c]}</span>
              <Select
                value={row.incomeItemMap?.[c]?.id ?? SAME}
                onValueChange={(v) => void setCategory(c, v)}
                disabled={items.isLoading || pending || !row.incomeItemId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SAME}>
                    Same as default
                    {row.incomeItemName ? ` (${row.incomeItemName})` : ""}
                  </SelectItem>
                  {options.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AccountSelect({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
}) {
  const accounts = useQuickBooksAccounts();
  return (
    <>
      <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled || accounts.isLoading}>
        <SelectTrigger className="max-w-lg">
          <SelectValue placeholder={accounts.isLoading ? "Loading accounts from QuickBooks…" : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {(accounts.data ?? []).map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
              <span className="text-muted-foreground"> · {a.accountType}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {accounts.error ? (
        <p className="text-sm text-destructive">{errMessage(accounts.error, "Could not load accounts")}</p>
      ) : null}
    </>
  );
}

function DepositStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Where card and ACH payments collected through Stripe are recorded. Most schools use a Stripe clearing account,
        since Stripe pays out in batches with its fees taken off. Undeposited Funds works too, but then your bookkeeper
        groups receipts into deposits and subtracts Stripe's fees by hand.
      </p>
      <AccountSelect
        value={row.depositAccountId}
        onChange={(v) => void save({ depositAccountId: v }, "Deposit account saved")}
        disabled={pending}
        placeholder="Choose an account"
      />
    </div>
  );
}

function DeskStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  const preview = useQuickBooksStartDatePreview(row.syncStartDateKey, {
    enabled: row.syncDeskPayments !== true,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedYear, setTypedYear] = useState("");
  const deskCount = preview.data?.desk.count ?? 0;
  const priorYear =
    preview.data?.byYear.find((y) => y.deskCount > 0 && y.year < row.todayKey.slice(0, 4))?.year ?? null;

  function choose(v: string) {
    // Turning desk payments on posts every desk payment since the start date. When
    // that is history, show the count first, exactly like choosing the start date.
    if (v === "yes" && row.syncStartDateKey && deskCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void save({ syncDeskPayments: v === "yes" }, "Saved");
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Cash and check payments the front desk marks as paid, including ones marked paid in your Stripe dashboard. If
        your bookkeeper already records those when the money is deposited, leave them out or they will be counted twice.
      </p>
      <RadioGroup
        value={row.syncDeskPayments == null ? "" : row.syncDeskPayments ? "yes" : "no"}
        onValueChange={choose}
        disabled={pending || (row.syncDeskPayments !== true && !!row.syncStartDateKey && !preview.isSuccess)}
        className="gap-2"
      >
        <Label htmlFor="qbo-desk-yes" className="flex cursor-pointer items-center gap-3 font-normal">
          <RadioGroupItem id="qbo-desk-yes" value="yes" />
          <span className="text-sm">Yes, post front-desk payments too</span>
        </Label>
        <Label htmlFor="qbo-desk-no" className="flex cursor-pointer items-center gap-3 font-normal">
          <RadioGroupItem id="qbo-desk-no" value="no" />
          <span className="text-sm">No, only card and ACH payments</span>
        </Label>
      </RadioGroup>
      {row.syncDeskPayments ? (
        <div className="space-y-1">
          <Label className="text-sm">Front-desk payments deposit to</Label>
          <AccountSelect
            value={row.deskDepositAccountId}
            onChange={(v) => void save({ deskDepositAccountId: v }, "Saved")}
            disabled={pending}
            placeholder="Usually Undeposited Funds"
          />
        </div>
      ) : null}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post front-desk payments too?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  {deskCount.toLocaleString()} front-desk payment
                  {deskCount === 1 ? "" : "s"} ({formatMoney(preview.data?.desk.totalCents ?? 0)}) since your start
                  date, {formatDateKey(row.syncStartDateKey)}, will post to {row.companyName ?? "QuickBooks"}.
                </p>
                {priorYear ? (
                  <p className="flex gap-2 rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    Some of these are from {priorYear}. If your bookkeeper already recorded them at deposit, answer No.
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {priorYear ? (
            <div className="space-y-1">
              <Label htmlFor="qbo-desk-type-year" className="text-sm">
                Type {priorYear} to confirm
              </Label>
              <Input
                id="qbo-desk-type-year"
                inputMode="numeric"
                className="w-28"
                value={typedYear}
                onChange={(e) => setTypedYear(e.target.value.trim())}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTypedYear("")}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void save({ syncDeskPayments: true }, "Front-desk payments will post").then(() => {
                  setConfirmOpen(false);
                  setTypedYear("");
                });
              }}
              disabled={pending || (!!priorYear && typedYear !== priorYear)}
            >
              Post them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EnableStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  const ready = (row.missingSetup ?? []).every((s) => s === "enable");
  const refused = row.blocker?.code === "books_owned_elsewhere";
  return (
    <div className="flex max-w-lg items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-4 py-3">
      <div>
        <p className="text-sm font-medium">Sync paid invoices</p>
        <p className="text-xs text-muted-foreground">
          {refused
            ? "Off, because another tool already records this revenue."
            : ready || row.enabled
              ? "Pausing is safe: anything missed posts when you turn it back on."
              : "Answer the steps above first."}
        </p>
      </div>
      <Switch
        checked={row.enabled}
        disabled={pending || refused || (!ready && !row.enabled)}
        onCheckedChange={(v) => void save({ enabled: v }, v ? "QuickBooks sync is on" : "Sync paused")}
      />
    </div>
  );
}
