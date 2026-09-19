import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DocsHint } from "@/components/docs-hint";
import { FlowChoice, FlowClose, FlowModal, FlowNav } from "@/components/onboarding/flows/flow-shell";
import {
  useConfirmQuickBooksCompany,
  useQuickBooksAccounts,
  useQuickBooksCompany,
  useQuickBooksItems,
  useQuickBooksStartDatePreview,
  useRemoveQuickBooksReceipts,
  useUpdateQuickBooksSettings,
  type QuickBooksBooksOwnership,
  type QuickBooksLineCategory,
  type QuickBooksSettings,
  type QuickBooksSettingsPatch,
  type QuickBooksSetupStep,
} from "@/features/queries";
import {
  addDaysToKey,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  formatDateKey,
  OWNERSHIP_OPTIONS,
  SETUP_ORDER,
  STEP_QUESTIONS,
} from "./labels";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Save an answer; the settings query refetches, which is what moves the flow on. */
function useSave() {
  const update = useUpdateQuickBooksSettings();
  async function save(patch: QuickBooksSettingsPatch, success?: string) {
    try {
      await update.mutateAsync(patch);
      if (success) toast.success(success);
      return true;
    } catch (err) {
      toast.error(errMessage(err, "Could not save"));
      return false;
    }
  }
  return { save, pending: update.isPending };
}

/**
 * The setup interview, one question per screen, in the checklist flows' modal.
 *
 * Every answer saves the moment it is given (the server is the source of truth, so
 * closing halfway loses nothing), and Continue opens once the server agrees the step
 * is answered. `only` opens a single step, for changing one answer later.
 */
export function QuickBooksSetupFlow({
  row,
  open,
  onOpenChange,
  only,
  onReconnect,
  reconnectDisabled,
}: {
  row: QuickBooksSettings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  only?: QuickBooksSetupStep | null;
  onReconnect: () => void;
  reconnectDisabled?: boolean;
}) {
  const missing = new Set(row.missingSetup ?? []);
  const firstMissing = SETUP_ORDER.findIndex((s) => missing.has(s));
  const [index, setIndex] = useState(0);
  const { save, pending } = useSave();

  // Each time it opens, start at the first question still unanswered.
  useEffect(() => {
    if (!open) return;
    setIndex(only ? SETUP_ORDER.indexOf(only) : Math.max(0, firstMissing));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open, only]);

  const step = SETUP_ORDER[index];
  const q = STEP_QUESTIONS[step];
  const answered = !missing.has(step);
  const refused = row.blocker?.code === "books_owned_elsewhere";
  const readyToEnable = [...missing].every((s) => s === "enable") && !refused;

  async function next() {
    if (step === "enable") {
      // The Overview behind the flow shows the posting progress, so there is no
      // separate finish screen: close and say what happens next.
      if (await save({ enabled: true }, "Sync is on. Paid invoices post in the background, oldest first.")) {
        onOpenChange(false);
      }
      return;
    }
    setIndex((i) => Math.min(i + 1, SETUP_ORDER.length - 1));
  }

  const footer = only ? (
    <FlowClose onClose={() => onOpenChange(false)} />
  ) : (
    <FlowNav
      onBack={index > 0 ? () => setIndex((i) => i - 1) : undefined}
      onNext={() => void next()}
      nextLabel={step === "enable" ? "Turn on sync" : "Continue"}
      nextDisabled={step === "enable" ? !readyToEnable : !answered}
      busy={pending}
    />
  );

  return (
    <FlowModal
      open={open}
      onOpenChange={onOpenChange}
      title={q.title}
      description={q.description}
      step={only ? undefined : index}
      stepCount={only ? undefined : SETUP_ORDER.length}
      size="lg"
      footer={footer}
    >
      {step === "confirm_company" && (
        <CompanyStep row={row} inFlow={!only} onReconnect={onReconnect} reconnectDisabled={reconnectDisabled} />
      )}
      {step === "books_ownership" && <OwnershipStep row={row} />}
      {step === "start_date" && <StartDateStep row={row} />}
      {step === "income_item" && <IncomeStep row={row} />}
      {step === "deposit_account" && <DepositStep row={row} />}
      {step === "desk_payments" && <DeskStep row={row} />}
      {step === "enable" && <EnableStep row={row} refused={refused} />}
    </FlowModal>
  );
}

//-------------------------------------------------------------------------------------
// The steps. Each reads and writes the live settings row; none keeps its own copy.
//-------------------------------------------------------------------------------------

export function Note({ tone = "muted", children }: { tone?: "muted" | "warning"; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-md px-3 py-2 text-sm",
        tone === "warning"
          ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {tone === "warning" ? <TriangleAlert className="mt-0.5 size-4 shrink-0" /> : null}
      <span>{children}</span>
    </p>
  );
}

function CompanyStep({
  row,
  inFlow,
  onReconnect,
  reconnectDisabled,
}: {
  row: QuickBooksSettings;
  inFlow: boolean;
  onReconnect: () => void;
  reconnectDisabled?: boolean;
}) {
  const company = useQuickBooksCompany();
  const confirm = useConfirmQuickBooksCompany();

  async function onConfirm() {
    if (!company.data) return;
    try {
      await confirm.mutateAsync(company.data.realmId);
    } catch (err) {
      toast.error(errMessage(err, "Could not confirm the company"));
    }
  }

  return (
    <div className="space-y-4">
      {company.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Reading the company from QuickBooks…
        </p>
      ) : company.error ? (
        <p className="text-sm text-destructive">{errMessage(company.error, "Could not read the company")}</p>
      ) : company.data ? (
        <dl className="divide-y divide-border rounded-md border border-border text-sm">
          {[
            ["Company", company.data.companyName ?? "Unnamed"],
            company.data.legalName && company.data.legalName !== company.data.companyName
              ? ["Legal name", company.data.legalName]
              : null,
            company.data.location ? ["Location", company.data.location] : null,
            company.data.fileCreatedAt
              ? ["Created in QuickBooks", formatDateKey(company.data.fileCreatedAt.slice(0, 10))]
              : null,
          ]
            .filter((r): r is string[] => !!r)
            .map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
        </dl>
      ) : null}

      {row.companyConfirmed ? (
        <Note>
          {inFlow
            ? "Confirmed. Continue to the next question."
            : "This company is confirmed. To use a different one, go to Connection."}
        </Note>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void onConfirm()} disabled={!company.data || confirm.isPending}>
            {confirm.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Yes, this is our company
          </Button>
          <Button variant="outline" onClick={onReconnect} disabled={reconnectDisabled}>
            Connect a different one
          </Button>
        </div>
      )}
    </div>
  );
}

function OwnershipStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  const selected = OWNERSHIP_OPTIONS.find((o) => o.value === row.booksOwnershipAnswer);

  return (
    <div className={cn("space-y-3", pending && "pointer-events-none opacity-70")}>
      <FlowChoice<QuickBooksBooksOwnership>
        options={OWNERSHIP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        value={row.booksOwnershipAnswer ?? null}
        onChange={(v) => void save({ booksOwnershipAnswer: v })}
      />
      {selected ? <Note tone={selected.effect === "refuse" ? "warning" : "muted"}>{selected.hint}</Note> : null}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <DocsHint topic="quickbooks-books-ownership" /> Not sure? Run Profit and Loss for last month in QuickBooks. If
        flight revenue already shows there, something is recording it.
      </p>
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
  const [removeBefore, setRemoveBefore] = useState(false);
  const [typedYear, setTypedYear] = useState("");

  const p = preview.data;
  const toPostCount = p ? p.stripe.count + (row.syncDeskPayments ? p.desk.count : 0) : 0;
  const toPostCents = p ? p.stripe.totalCents + (row.syncDeskPayments ? p.desk.totalCents : 0) : 0;
  const earliestYear = p?.byYear.find((y) => y.count > 0 || (row.syncDeskPayments && y.deskCount > 0))?.year ?? null;
  const reachesPriorYear = !!earliestYear && earliestYear < row.todayKey.slice(0, 4) && toPostCount > 0;
  const busy = update.isPending || remove.isPending;

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
      setTypedYear("");
      setRemoveBefore(false);
    } catch (err) {
      toast.error(errMessage(err, "Could not save the start date"));
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="qbo-start" className="flex items-center gap-1.5">
          Start date <DocsHint topic="quickbooks-start-date" />
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
        <p className="text-xs text-muted-foreground">
          {forwardOnly
            ? "Your books already record this revenue, so this can only be today or later."
            : "Pick today to start fresh, or an earlier date to include past invoices."}
          {row.bookCloseDateKey ? ` Your books are closed through ${formatDateKey(row.bookCloseDateKey)}.` : ""}
        </p>
        {!valid && minKey ? <p className="text-sm text-destructive">Pick {formatDateKey(minKey)} or later.</p> : null}
      </div>

      {valid && preview.isError ? (
        <p className="text-sm text-destructive">Couldn't count what this date would post. Try again in a moment.</p>
      ) : valid && preview.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Counting what this would post…
        </p>
      ) : p ? (
        <div className="rounded-md border border-border">
          <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
            <span className="text-sm">{changed ? "Would post" : "Still to post"}</span>
            <span className="text-sm font-medium tabular-nums">
              {toPostCount.toLocaleString()} invoice{toPostCount === 1 ? "" : "s"} · {formatMoney(toPostCents)}
            </span>
          </div>
          {p.byYear.length > 1 ? (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {p.byYear
                .map((y) => {
                  const n = y.count + (row.syncDeskPayments ? y.deskCount : 0);
                  return `${y.year}: ${n.toLocaleString()}`;
                })
                .join(" · ")}
            </div>
          ) : null}
          {!row.syncDeskPayments && p.desk.count > 0 ? (
            <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              Plus {p.desk.count.toLocaleString()} front-desk payment{p.desk.count === 1 ? "" : "s"} if you choose to
              post those.
            </div>
          ) : null}
        </div>
      ) : null}

      {changed && p ? (
        <div className="space-y-3">
          {reachesPriorYear ? (
            <>
              <Note tone="warning">
                This reaches back into {earliestYear}, a year you have probably already filed taxes for. Check with your
                bookkeeper first.
              </Note>
              <div className="space-y-1.5">
                <Label htmlFor="qbo-type-year">
                  Type <span className="font-medium text-foreground">{earliestYear}</span> to confirm
                </Label>
                <Input
                  id="qbo-type-year"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={earliestYear ?? undefined}
                  value={typedYear}
                  onChange={(e) => setTypedYear(e.target.value.trim())}
                />
              </div>
            </>
          ) : null}
          {p.alreadyPostedBefore.count > 0 ? (
            <Label className="flex items-start gap-2 font-normal">
              <Checkbox
                checked={removeBefore}
                onCheckedChange={(v) => setRemoveBefore(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                {`Also remove the ${p.alreadyPostedBefore.count.toLocaleString()} receipt${p.alreadyPostedBefore.count === 1 ? "" : "s"} (${formatMoney(p.alreadyPostedBefore.totalCents)}) AerScheduler already posted for invoices paid before this date`}
              </span>
            </Label>
          ) : null}
          <Button onClick={() => void commit()} disabled={busy || (reachesPriorYear && typedYear !== earliestYear)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {row.syncStartDateKey ? "Change start date" : "Use this date"}
          </Button>
        </div>
      ) : null}
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
    await save({ incomeItemMap: next });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Default item</Label>
        <Select
          value={row.incomeItemId ?? undefined}
          onValueChange={(v) => void save({ incomeItemId: v })}
          disabled={items.isLoading || pending}
        >
          <SelectTrigger className="w-full">
            <SelectValue
              placeholder={
                items.isLoading
                  ? "Loading items from QuickBooks…"
                  : options.length === 0
                    ? "No usable items in QuickBooks yet. Create a Service item there first."
                    : "Choose an item"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
                {item.incomeAccountName ? ` · ${item.incomeAccountName}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Only Service and Non-inventory items can be used.</p>
        {items.error ? (
          <p className="text-sm text-destructive">{errMessage(items.error, "Could not load items")}</p>
        ) : null}
      </div>

      <div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm font-medium text-primary"
          onClick={() => setShowSplit((v) => !v)}
          aria-expanded={showSplit}
        >
          <ChevronDown className={cn("size-4 transition-transform", showSplit && "rotate-180")} />
          Use a separate item for each kind of charge
        </button>
        {showSplit ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Rental, instruction and fees then show as separate lines on your Profit and Loss. Set this before posting
              past invoices. Changing it later won't update receipts already in QuickBooks.
            </p>
            {CATEGORY_ORDER.map((c) => (
              <div key={c} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[1fr_15rem] sm:gap-3">
                <span className="text-sm">{CATEGORY_LABELS[c]}</span>
                <Select
                  value={row.incomeItemMap?.[c]?.id ?? SAME}
                  onValueChange={(v) => void setCategory(c, v)}
                  disabled={items.isLoading || pending || !row.incomeItemId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SAME}>Same as default</SelectItem>
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
        <SelectTrigger className="w-full">
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
      <div className="space-y-1.5">
        <Label>Deposit account</Label>
        <AccountSelect
          value={row.depositAccountId}
          onChange={(v) => void save({ depositAccountId: v })}
          disabled={pending}
          placeholder="Choose an account"
        />
      </div>
      <Note>
        Most schools use a Stripe clearing account, because Stripe pays out in batches with its fees taken off.
        Undeposited Funds works too, but then your bookkeeper groups receipts into deposits and subtracts Stripe's fees
        by hand.
      </Note>
    </div>
  );
}

function DeskStep({ row }: { row: QuickBooksSettings }) {
  const { save, pending } = useSave();
  const preview = useQuickBooksStartDatePreview(row.syncStartDateKey, { enabled: row.syncDeskPayments !== true });
  const [confirming, setConfirming] = useState(false);
  const [typedYear, setTypedYear] = useState("");
  const deskCount = preview.data?.desk.count ?? 0;
  const priorYear =
    preview.data?.byYear.find((y) => y.deskCount > 0 && y.year < row.todayKey.slice(0, 4))?.year ?? null;

  function choose(v: "yes" | "no") {
    // Turning desk payments on posts every desk payment since the start date. When
    // that is history, show the count first, exactly like choosing the start date.
    if (v === "yes" && row.syncDeskPayments !== true && row.syncStartDateKey && deskCount > 0) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    void save({ syncDeskPayments: v === "yes" });
  }

  return (
    <div className={cn("space-y-4", pending && "pointer-events-none opacity-70")}>
      <FlowChoice<"yes" | "no">
        options={[
          { value: "yes", label: "Yes, post front-desk payments too" },
          {
            value: "no",
            label: "No, only card and ACH payments",
            hint: "Pick this if your bookkeeper records cash and checks at deposit.",
          },
        ]}
        value={confirming ? "yes" : row.syncDeskPayments == null ? null : row.syncDeskPayments ? "yes" : "no"}
        onChange={choose}
      />

      {confirming ? (
        <div className="space-y-3">
          <Note tone={priorYear ? "warning" : "muted"}>
            {`This posts ${deskCount.toLocaleString()} front-desk payment${deskCount === 1 ? "" : "s"} (${formatMoney(preview.data?.desk.totalCents ?? 0)}) received since ${formatDateKey(row.syncStartDateKey)}.`}
            {priorYear
              ? ` Some are from ${priorYear}. If your bookkeeper already recorded them at deposit, choose No.`
              : ""}
          </Note>
          {priorYear ? (
            <div className="space-y-1.5">
              <Label htmlFor="qbo-desk-type-year">
                Type <span className="font-medium text-foreground">{priorYear}</span> to confirm
              </Label>
              <Input
                id="qbo-desk-type-year"
                inputMode="numeric"
                autoComplete="off"
                placeholder={priorYear ?? undefined}
                value={typedYear}
                onChange={(e) => setTypedYear(e.target.value.trim())}
              />
            </div>
          ) : null}
          <Button
            disabled={pending || (!!priorYear && typedYear !== priorYear)}
            onClick={() =>
              void save({ syncDeskPayments: true }).then((ok) => {
                if (ok) {
                  setConfirming(false);
                  setTypedYear("");
                }
              })
            }
          >
            Post them
          </Button>
        </div>
      ) : null}

      {row.syncDeskPayments ? (
        <div className="space-y-1.5">
          <Label>Front-desk payments deposit to</Label>
          <AccountSelect
            value={row.deskDepositAccountId}
            onChange={(v) => void save({ deskDepositAccountId: v })}
            disabled={pending}
            placeholder="Usually Undeposited Funds"
          />
        </div>
      ) : null}
    </div>
  );
}

function EnableStep({ row, refused }: { row: QuickBooksSettings; refused: boolean }) {
  if (refused) {
    return (
      <Note tone="warning">
        Sync stays off because of your answer about what else records flight revenue. Once nothing else records it,
        change that answer in Settings.
      </Note>
    );
  }
  const rows: Array<[string, string]> = [
    ["Company", row.companyName ?? "…"],
    ["Start date", row.effectiveStartDateKey ? formatDateKey(row.effectiveStartDateKey) : "…"],
    ["Income item", row.incomeItemName ?? "…"],
    ["Card payments deposit to", row.depositAccountName ?? "…"],
    ["Front-desk payments", row.syncDeskPayments ? `Yes, to ${row.deskDepositAccountName ?? "…"}` : "No"],
  ];
  return (
    <dl className="divide-y divide-border rounded-md border border-border text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 px-3 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
