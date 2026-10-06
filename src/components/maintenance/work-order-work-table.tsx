import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, MoreHorizontal, Paperclip, Pencil, Phone, Plus, Receipt, ScanSearch, Send, Trash2, UserRound } from "lucide-react";
import {
  useBilling,
  useRecordOwnerAnswer,
  useRemoveWorkOrderItem,
  useRemoveWorkOrderLine,
  useUpdateWorkOrderItem,
  useWorkOrderFiles,
  useWorkOrderItems,
  useWorkOrderLines,
  useWorkOrderInvoicePreview,
  useWorkOrderSendAudience,
  useWorkOrderSettings,
} from "@/features/queries";
import { sendFindingsToOwner } from "@/features/send-to-owner";
import type { WorkOrder, WorkOrderItem, WorkOrderLine, WorkOrderLineCategory, WorkOrderSendAudience } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ExplainedButton } from "@/components/explained-button";
import { useAuth } from "@/lib/auth";
import { canManageBilling, canResolveSquawk, isAdmin } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { DocsHint } from "@/components/docs-hint";
import { ErrorState } from "@/components/states";
import { LIST_TAG_BUTTON_CLASS, LIST_TAG_CLASS, ListTable, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { cn } from "@/lib/utils";
import { STICKY_GROUP_CLASS, TALL_LIST_CLASS } from "@/components/combobox";
import { WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { WorkStatusIcon, type WorkStatus } from "@/components/maintenance/work-status-icon";
import { WorkOrderItemModal } from "@/components/maintenance/work-order-item-modal";
import { RecordOwnerAnswerModal } from "@/components/maintenance/record-owner-answer-modal";
import { SignOffLinked } from "@/components/maintenance/work-order-work";
import { eachLabel, RaiseInvoiceModal } from "@/components/maintenance/work-order-lines";
import { LINE_KIND_ICON, LINE_KINDS, WorkOrderLineModal } from "@/components/maintenance/work-order-line-modal";
import { useAttach, useFilePicker } from "@/components/maintenance/work-order-files";
import { FirstJobGuide, type FirstJobGuideStep } from "@/components/maintenance/first-job-guide";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * The work on a job and what it charges, in one list (Tony picked the layout, 2026-09-30): what
 * the owner asked for and what the shop found, each item with the labor and parts done for it
 * underneath, and every row sharing the Qty, Each and Total columns. It replaced two cards, "The
 * work" and "Labor and parts", where a line said which item it was for in small print and the
 * desk matched them by eye.
 *
 * The rules are the cards' rules, unchanged: anyone in the shop adds items and lines; a line is
 * changed only by an admin or the person who entered it; signing off an attached inspection or
 * resolving a squawk is an admin's or a technician's; raising the invoice is an admin's; an
 * invoiced job's lines are frozen until the invoice is voided.
 */

const COLUMNS: ListTableColumn[] = [
  { id: "who", header: "Who", width: "9rem" },
  { id: "qty", header: "Qty", width: "4rem", align: "end" },
  { id: "each", header: "Each", width: "6rem", align: "end" },
  { id: "total", header: "Total", width: "6.5rem", align: "end", narrow: "keep" },
];

/**
 * Narrower than this (the job page beside its details card on a 1280 screen), the line names were
 * squeezed to "E2…" (Tony, 2026-10-01): the list takes its narrow layout, where Who goes under each
 * line's name and the tags wrap, and the numbers stay columns. Narrower than a phone's
 * `PHONE_AT`, the numbers fold under the name as well.
 */
const FOLD_WHO_AT = 800;
const PHONE_AT = 600;
const COLUMNS_FOLD_WHO: ListTableColumn[] = COLUMNS.map((c) => (c.id === "qty" || c.id === "each" ? { ...c, narrow: "keep" } : c));

/** The width of the element `ref` points at, kept current. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

const KIND_ICON = LINE_KIND_ICON;

const DECISION_TAG: Record<NonNullable<WorkOrderItem["decision"]>, { label: string; dot: string }> = {
  approved: { label: "Approved", dot: "var(--primary)" },
  declined: { label: "Declined", dot: "var(--muted-foreground)" },
  deferred: { label: "Deferred", dot: "var(--muted-foreground)" },
};

/** Where an item stands, as the ring before it says. */
function itemStatus(i: WorkOrderItem): WorkStatus {
  if (i.done) return "done";
  if (i.decision === "declined") return "declined";
  if (i.decision === "deferred") return "deferred";
  if (i.inspection || i.squawk) return "progress";
  if (i.decision === "approved") return "approved";
  if (i.source === "found") return "notAsked";
  return "todo";
}

/** The small print under a line: how it was priced and what the shop knows about it. */
function lineFacts(l: WorkOrderLine): string {
  if (l.category === "labor") {
    const atRate = l.minutes != null && l.rateCents != null && Math.round((l.minutes * l.rateCents) / 60) === l.unitPriceCents;
    return [atRate ? null : "Flat price", l.workedOn ? formatDate(`${l.workedOn}T12:00:00`, "MMM d", "") : null].filter(Boolean).join(" · ");
  }
  const priced = l.costCents != null && l.markupBps != null ? `cost ${formatMoney(l.costCents)} + ${l.markupBps / 100}%` : null;
  return [l.partNumber ? `P/N ${l.partNumber}` : null, l.serialNumber ? `S/N ${l.serialNumber}` : null, l.vendor, priced, l.partStatus].filter(Boolean).join(" · ");
}

export function WorkOrderWorkTable({
  workOrder: w,
  guide,
}: {
  workOrder: WorkOrder;
  /** The first-job walkthrough (`?tour=true` after a shop's setup), and how to put it away. */
  guide?: { onClose: () => void };
}) {
  const itemsQ = useWorkOrderItems(w.id);
  const linesQ = useWorkOrderLines(w.id);
  const settingsQ = useWorkOrderSettings();
  const items = React.useMemo(() => itemsQ.data ?? [], [itemsQ.data]);
  const lines = React.useMemo(() => linesQ.data ?? [], [linesQ.data]);
  // Photos on an item (the crack on its finding): attached from the item's menu, counted on its row.
  const filesQ = useWorkOrderFiles(w.id);
  const filesOn = React.useMemo(() => {
    const m = new Map<number, number>();
    for (const f of filesQ.data ?? []) if (f.itemId != null) m.set(f.itemId, (m.get(f.itemId) ?? 0) + 1);
    return m;
  }, [filesQ.data]);
  const attachFor = React.useRef<number | null>(null);
  const { run: attach } = useAttach(w.id);
  const picker = useFilePicker((files) => void attach(files, attachFor.current));
  const { roles, orgUserId, user } = useAuth();
  const canInvoice = canManageBilling(roles);
  // Signing off an inspection or resolving a squawk is an admin's or a technician's (the server's
  // rule for both), so nobody is offered a button the server then refuses.
  const maySignOff = canResolveSquawk(roles);
  // An admin changes any line; anyone else only the lines they entered (the server's rule).
  const mayChange = (l: WorkOrderLine) => canInvoice || (orgUserId != null && l.createdByOrgUserId === orgUserId);
  const frozen = w.invoice != null;

  const [addingItem, setAddingItem] = React.useState<WorkOrderItem["source"] | null>(null);
  const [editingItem, setEditingItem] = React.useState<WorkOrderItem | null>(null);
  const [answering, setAnswering] = React.useState(false);
  const [signing, setSigning] = React.useState<WorkOrderItem | null>(null);
  const [addingLine, setAddingLine] = React.useState<{ kind: WorkOrderLineCategory; itemId: number | null } | null>(null);
  const [editingLine, setEditingLine] = React.useState<WorkOrderLine | null>(null);
  const [raising, setRaising] = React.useState(false);
  const updateItem = useUpdateWorkOrderItem();
  const removeItem = useRemoveWorkOrderItem();
  const removeLine = useRemoveWorkOrderLine();
  const confirm = useConfirm();

  // What the owner declined or put off is left off the bill (the server's `leftOffBill`, Tony
  // 2026-10-05): its lines show struck through and count toward nothing.
  const leftOffItems = new Set(items.filter((i) => i.decision === "declined" || i.decision === "deferred").map((i) => i.id));
  const leftOff = (l: WorkOrderLine) => l.itemId != null && leftOffItems.has(l.itemId);
  const chargeOf = (l: WorkOrderLine) => (leftOff(l) ? 0 : l.totalCents);
  const subtotal = lines.reduce((sum, l) => sum + chargeOf(l), 0);
  // A finding still to be answered is either not sent to the owners yet (the shop's own) or sent
  // and waiting. Done is done: nothing to ask.
  const pending = items.filter((i) => i.source === "found" && !i.decision && !i.done);
  const unsent = pending.filter((i) => !i.sentToOwnerAt);
  const waiting = pending.length - unsent.length;
  const [sending, setSending] = React.useState(false);
  // Owners to ask exist only on a customer's aircraft; the organization decides its own.
  const customer = w.aircraft.use === "shop";
  const mayAsk = customer && !frozen && w.closedAt == null;
  // An answer (the owner's, or the organization's own decision) is recorded only on an open job
  // with no live invoice: the server refuses it on an invoiced one, whose bill already charges
  // for the work as it stands (C8).
  const mayDecide = !frozen && w.closedAt == null;
  const decisionLocked = frozen ? "Invoiced: void the invoice to change the work." : "Closed: reopen the job to change the work.";

  async function send() {
    const ok = await confirm({
      title: `Send ${unsent.length} ${unsent.length === 1 ? "finding" : "findings"} to the owner?`,
      description: `${unsent.map((i) => i.description).join("; ")}. Every owner of the aircraft is told and asked to approve, decline or put off each one; prices go only to the person billed.`,
      confirmLabel: "Send",
    });
    if (!ok) return;
    setSending(true);
    await sendFindingsToOwner(qc, w.id);
    setSending(false);
  }

  async function toggleDone(item: WorkOrderItem) {
    try {
      await updateItem.mutateAsync({ workOrderId: w.id, itemId: item.id, done: !item.done });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the item");
    }
  }

  // The owner's answer for one item, picked from its tag (Linear's status menu). An answer is a
  // record of a call, so it is recorded as one, from the person billed, now (the server stamps
  // the time); it shows under Owner's answers like any other. "Record a call with notes" is there
  // for the full story. On the organization's own aircraft there is no owner to call: it is the
  // shop's decision, recorded under the name of whoever made it.
  const recordAnswer = useRecordOwnerAnswer();
  const qc = useQueryClient();
  async function decide(item: WorkOrderItem, decision: NonNullable<WorkOrderItem["decision"]>) {
    if (item.decision === decision) return;
    const key = ["workOrders", "items", w.id];
    const before = qc.getQueryData<WorkOrderItem[]>(key);
    if (before) qc.setQueryData<WorkOrderItem[]>(key, before.map((i) => (i.id === item.id ? { ...i, decision } : i)));
    try {
      const done = await recordAnswer.mutateAsync({
        workOrderId: w.id,
        decisions: [{ itemId: item.id, decision }],
        ...(customer
          ? { contactName: w.billTo?.name ?? "The owner" }
          : { contactName: user?.name?.trim() || "The organization", notes: "Decided by the shop" }),
      });
      // A later call already answered it: that answer stands, and the desk is told so.
      if (done.kept.length) toast.warning(`Recorded the call; kept the later answer for ${done.kept.map((k) => k.description).join(", ")}`);
    } catch (e) {
      if (before) qc.setQueryData(key, before);
      toast.error(e instanceof Error ? e.message : "Couldn't record the answer");
    }
  }

  async function dropItem(item: WorkOrderItem) {
    const ok = await confirm({
      title: "Remove this item?",
      description: `"${item.description}" comes off ${w.label}. Its inspection or squawk is not touched, and its lines stay on the job.`,
      confirmLabel: "Remove item",
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeItem.mutateAsync({ workOrderId: w.id, itemId: item.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the item");
    }
  }

  async function dropLine(l: WorkOrderLine) {
    const ok = await confirm({ title: "Remove this line?", description: `"${l.description}" comes off ${w.label}.`, confirmLabel: "Remove line", destructive: true });
    if (!ok) return;
    try {
      await removeLine.mutateAsync({ workOrderId: w.id, lineId: l.id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the line");
    }
  }

  const lineRow = (l: WorkOrderLine): ListTableRow => {
    const Icon = KIND_ICON[l.category];
    const facts = lineFacts(l);
    const editable = !frozen && mayChange(l);
    return {
      id: `line-${l.id}`,
      label: l.description,
      leading: <Icon className="size-3.5 text-muted-foreground" />,
      title: l.description,
      tags: (l.discountBps || !l.billable || leftOff(l) || l.taxable != null) && (
        <>
          {l.discountBps ? <ListTag>{l.discountBps / 100}% off</ListTag> : null}
          {(!l.billable || leftOff(l)) && <ListTag>Not billed</ListTag>}
          {l.taxable === true && <ListTag>Taxable</ListTag>}
          {l.taxable === false && <ListTag>Not taxable</ListTag>}
        </>
      ),
      subtitle: facts || undefined,
      dim: !l.billable || leftOff(l),
      cells: {
        who: l.technician ? <WorkspaceUserAvatar person={l.technician} showName nameClassName="text-muted-foreground" /> : null,
        qty: l.category === "labor" ? l.hours : String(l.qty),
        each: eachLabel(l),
        total: !l.billable ? "–" : leftOff(l) ? <NotBilled cents={l.totalCents} /> : <span className="font-medium text-foreground">{formatMoney(l.totalCents)}</span>,
      },
      onOpen: editable ? () => setEditingLine(l) : undefined,
      actions: editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`More for "${l.description}"`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditingLine(l)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void dropLine(l)}>
              <Trash2 className="size-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : undefined,
    };
  };

  const itemIds = new Set(items.map((i) => i.id));
  const itemRow = (item: WorkOrderItem): ListTableRow => {
    const own = lines.filter((l) => l.itemId === item.id);
    const charged = own.reduce((sum, l) => sum + l.totalCents, 0);
    const offBill = leftOffItems.has(item.id) && charged > 0;
    const linked = item.inspection ?? item.squawk;
    const status = <WorkStatusIcon status={itemStatus(item)} />;
    return {
      id: `item-${item.id}`,
      label: item.description,
      emphasis: true,
      span: true,
      // A plain item is ticked done from its ring; one tied to an inspection or a squawk is done
      // when that is signed off or resolved.
      leading:
        item.doneVia === "item" ? (
          <button
            type="button"
            onClick={() => void toggleDone(item)}
            className="grid place-items-center rounded-full hover:opacity-80"
            aria-label={item.done ? `Mark "${item.description}" not done` : `Mark "${item.description}" done`}
          >
            {status}
          </button>
        ) : (
          status
        ),
      title: item.description,
      tags: (
        <>
          {(item.decision || item.source === "found") &&
            (mayDecide ? (
              <DecisionMenu customer={customer} item={item} onPick={(d) => void decide(item, d)} onFullCall={customer ? () => setAnswering(true) : undefined} />
            ) : (
              <DecisionTag customer={customer} item={item} locked={decisionLocked} />
            ))}
          {item.inspection && <ListTag>{item.inspection.name ?? "Inspection"}</ListTag>}
          {(filesOn.get(item.id) ?? 0) > 0 && (
            <ListTag>
              <Paperclip className="size-3" aria-hidden /> {filesOn.get(item.id)}
              <span className="sr-only"> {filesOn.get(item.id) === 1 ? "file" : "files"}</span>
            </ListTag>
          )}
          {item.squawk && <ListTag>Squawk</ListTag>}
          {linked && !item.done && maySignOff && (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[12px]" onClick={() => setSigning(item)}>
              <Check className="size-3" /> {item.inspection ? "Sign off" : "Resolve"}
            </Button>
          )}
        </>
      ),
      subtitle:
        item.done && item.doneAt
          ? `Done ${formatDate(item.doneAt, "MMM d", "")}${item.doneBy?.name ? ` by ${item.doneBy.name}` : ""}${
              item.doneVia === "inspection" ? ", signed off" : item.doneVia === "squawk" ? ", squawk resolved" : ""
            }`
          : item.squawk
            ? item.squawk.title
            : offBill
              ? `Not billed: ${customer ? "the owner" : "the shop"} ${item.decision === "declined" ? "declined it" : "put it off"}`
              : undefined,
      cells: {
        total: !own.length ? (
          <span className="text-muted-foreground">No charges</span>
        ) : offBill ? (
          <NotBilled cents={charged} />
        ) : (
          <span className="font-medium text-foreground">{formatMoney(charged)}</span>
        ),
      },
      children: own.map(lineRow),
      actions: (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7" aria-label={`More for "${item.description}"`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!frozen && (
              <>
                <DropdownMenuItem onSelect={() => setAddingLine({ kind: "labor", itemId: item.id })}>
                  <Plus className="size-4" /> Add labor or a part for it
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {item.doneVia === "item" && (
              <DropdownMenuItem onSelect={() => void toggleDone(item)}>
                <Check className="size-4" /> {item.done ? "Mark not done" : "Mark done"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onSelect={() => {
                attachFor.current = item.id;
                picker.open();
              }}
            >
              <Paperclip className="size-4" /> Attach a photo or file
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setEditingItem(item)}>
              <Pencil className="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void dropItem(item)}>
              <Trash2 className="size-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    };
  };

  const sum = (ls: WorkOrderLine[]) => ls.reduce((s, l) => s + chargeOf(l), 0);
  const requested = items.filter((i) => i.source === "requested");
  const found = items.filter((i) => i.source === "found");
  // A line for no item, or for an item since removed, still charges: it is listed on its own.
  const loose = lines.filter((l) => l.itemId == null || !itemIds.has(l.itemId));
  const groups: ListTableGroup[] = [
    {
      id: "requested",
      // The organization's own aircraft has no owner asking: the work is just requested.
      label: customer ? "Requested by the owner" : "Requested",
      count: requested.length,
      summary: formatMoney(sum(lines.filter((l) => requested.some((i) => i.id === l.itemId)))),
      rows: requested.map(itemRow),
      onAdd: () => setAddingItem("requested"),
      addLabel: customer ? "Add an owner's request" : "Add a request",
    },
    {
      id: "found",
      label: "Found by the shop",
      count: found.length,
      summary: formatMoney(sum(lines.filter((l) => found.some((i) => i.id === l.itemId)))),
      rows: found.map(itemRow),
      onAdd: () => setAddingItem("found"),
      addLabel: "Add a finding",
    },
    {
      id: "loose",
      label: "Not for a specific item",
      count: loose.length,
      summary: formatMoney(sum(loose)),
      rows: loose.map(lineRow),
      // Once invoiced the lines are frozen, so only work can still be added.
      onAdd: frozen ? undefined : () => setAddingLine({ kind: "labor", itemId: null }),
      addLabel: "Add a charge not for an item",
    },
  ];

  // One Add menu, not four buttons (Tony, 2026-09-30): the work first, then the kinds of
  // charge, names only (Tony, 2026-10-01, took the explanations off). The hints below are kept
  // as search words, so typing "markup" still finds Part. Recording the owner's answer sits
  // beside Add (Tony, 2026-10-05); raising the invoice sits by the total it bills.
  const LINE_HINT: Partial<Record<WorkOrderLineCategory, string>> = {
    labor: "Hours at the shop rate",
    part: "Cost plus the markup",
    outside_service: "Work sent out, cost plus the markup",
  };
  // Who Send to owner would reach, asked before it is pressed: with nobody to reach the button is
  // disabled and says why on hover, with the way to fix it (Tony, 2026-10-05).
  const audienceQ = useWorkOrderSendAudience(mayAsk && unsent.length > 0 ? w.id : null);
  const sendBlocked = !!audienceQ.data?.blocked;
  const sendExplain = audienceQ.data
    ? explainSend(audienceQ.data, unsent.length, w.billTo?.name ?? null, w.aircraft.id, mayDecide ? () => setAnswering(true) : undefined)
    : null;

  // Only a status earns the line under the title (Tony, 2026-10-05: a sentence describing the
  // card on every job was a waste of space). It wraps rather than being cut on a phone (L14):
  // "1 finding not sent to the own…" was the one thing the line was there to say.
  const status = frozen
    ? "Invoiced: void the invoice to change the work."
    : !customer
      ? // The organization's own aircraft: nothing is sent, the shop decides.
        pending.length
        ? `${pending.length} finding${pending.length === 1 ? "" : "s"} not decided yet.`
        : null
      : unsent.length
        ? `${unsent.length} finding${unsent.length === 1 ? "" : "s"} not sent to the owner yet.`
        : waiting
          ? `${waiting} finding${waiting === 1 ? "" : "s"} waiting for the owner's answer.`
          : null;
  const toolbar = (
    <>
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-1 text-sm font-semibold">
          Work and charges
          <DocsHint topic="work-order-lines" />
        </div>
        {status && <p className="text-[12px] text-muted-foreground">{status}</p>}
      </div>
      {mayAsk && unsent.length > 0 && (
        <ExplainedButton
          size="sm"
          variant="outline"
          onClick={() => void send()}
          disabled={sending || sendBlocked}
          explain={sendExplain?.node}
          summary={sendExplain?.text}
        >
          <Send className="size-4" /> Send to owner
        </ExplainedButton>
      )}
      {customer && mayDecide && items.length > 0 && (
        <Button size="sm" variant="outline" onClick={() => setAnswering(true)}>
          <Phone className="size-4" /> Record owner's answer
        </Button>
      )}
      <AddMenu
        frozen={frozen}
        customer={customer}
        lineHint={LINE_HINT}
        onItem={(source) => setAddingItem(source)}
        onLine={(kind) => setAddingLine({ kind, itemId: null })}
      />
    </>
  );
  const mayRaise = canInvoice && !frozen && !!w.billTo && subtotal > 0 && w.status !== "cancelled";
  // The bill priced as the server would raise it: a reason it cannot be raised (a taxable line
  // with no sales tax rate) disables the button and says so on hover, rather than the dialog
  // opening onto an error (Tony, 2026-10-05). Keyed under ["workOrders"], so a line or a rate
  // changed re-prices it.
  const readyQ = useWorkOrderInvoicePreview(mayRaise ? w.id : null);
  const raiseBlock = readyQ.error instanceof ApiError && readyQ.error.status >= 400 && readyQ.error.status < 500 ? readyQ.error : null;
  const raiseExplain = raiseBlock ? explainRaise(raiseBlock, isAdmin(roles)) : null;

  // Each step is read from the job (see FirstJobGuide): the buttons open the forms this page
  // already has, so doing the step from the Add menu ticks it just the same.
  const billingQ = useBilling({ enabled: !!guide && canInvoice });
  const navigate = useNavigate();
  const stripeOn = Boolean(billingQ.data?.stripeEnabled);
  const firstFound = items.find((i) => i.source === "found");
  const guideSteps: FirstJobGuideStep[] = [
    {
      id: "finding",
      title: "Write up what you found",
      body: "Anything beyond what the owner asked for: a worn brake pad, a cracked exhaust stack. Attach a photo from its menu.",
      done: items.some((i) => i.source === "found"),
      action: mayAsk ? { label: "Add a finding", onClick: () => setAddingItem("found") } : undefined,
    },
    {
      id: "lines",
      title: "Add your labor and a part",
      body: settingsQ.data?.laborRateCents != null
        ? `Labor fills in at your ${formatMoney(settingsQ.data.laborRateCents)} an hour, and a part at cost plus your markup. The total updates as you go.`
        : "Labor at your shop rate and a part at cost plus your markup. The total updates as you go.",
      done: lines.length > 0,
      action: frozen ? undefined : { label: "Add labor", onClick: () => setAddingLine({ kind: "labor", itemId: firstFound?.id ?? null }) },
    },
    {
      id: "send",
      title: "Send it to the owner",
      body: w.billTo?.contactEmail
        ? `${w.billTo.name ?? "The owner"} gets an email to approve, decline or put off each finding. Prices go only to the person billed.`
        : "Every owner is emailed to approve, decline or put off each finding. Add an email on the aircraft's Owners panel to reach them.",
      done: items.some((i) => i.sentToOwnerAt != null),
      action: mayAsk && unsent.length > 0 && !sendBlocked ? { label: "Send to owner", onClick: () => void send() } : undefined,
      waiting: sendBlocked && audienceQ.data?.blocked ? audienceQ.data.blocked : "Write up a finding first.",
    },
    {
      id: "invoice",
      title: "Raise the invoice",
      body: "Labor and parts go on one invoice with the WO number, the tail and the meters. The owner pays it by card or ACH.",
      done: frozen,
      action:
        mayRaise && stripeOn && !raiseBlock
          ? { label: "Raise invoice", onClick: () => setRaising(true) }
          : //A new shop has no billing row at all (the settings are created lazily), which is
            //"not connected", not "unknown": offer the way there rather than a dead sentence.
            canInvoice && !billingQ.isLoading && !stripeOn
            ? { label: "Connect billing", onClick: () => void navigate({ to: "/settings", search: { tab: "billing" } as never }) }
            : undefined,
      waiting: !canInvoice
        ? "An admin raises the invoice."
        : raiseBlock
          ? raiseBlock.message
        : !stripeOn
          ? "Connect billing first, in Settings, Billing."
          : !w.billTo
            ? "Choose who pays under Details."
            : "Add a priced line first.",
    },
  ];

  const loading = itemsQ.isLoading || linesQ.isLoading;
  const failed = itemsQ.isError ? itemsQ : linesQ.isError ? linesQ : null;
  const box = React.useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const phone = width != null && width < PHONE_AT;

  return (
    <div ref={box} className="flex min-h-0 flex-1 flex-col gap-2">
      {picker.input}
      {guide && !loading && !failed ? <FirstJobGuide steps={guideSteps} onClose={guide.onClose} /> : null}
      {loading ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : failed ? (
        <div className="rounded-lg border border-border bg-card">
          <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
        </div>
      ) : (
        <ListTable
          fill
          label={`Work and charges on ${w.label}`}
          docShot="work-order-work"
          columns={width != null && !phone ? COLUMNS_FOLD_WHO : COLUMNS}
          narrowAt={FOLD_WHO_AT}
          groups={groups}
          titleHeader="Item or line"
          showHeader
          toolbar={toolbar}
          footer={
            lines.length
              ? {
                  // A phone cut the long label to "Bille…" beside the Raise button (L14): there
                  // both say less, and the button keeps its full name for a screen reader.
                  label: phone ? "Before tax" : "Billed before tax and fees",
                  value: formatMoney(subtotal),
                  action: mayRaise ? (
                    <ExplainedButton
                      size="sm"
                      onClick={() => setRaising(true)}
                      aria-label="Raise invoice"
                      disabled={!!raiseBlock}
                      explain={raiseExplain?.node}
                      summary={raiseExplain?.text}
                    >
                      <Receipt className="size-4" /> {phone ? "Raise" : "Raise invoice"}
                    </ExplainedButton>
                  ) : undefined,
                }
              : undefined
          }
          empty={
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              {customer
                ? "Nothing on the job yet. Add what the owner asked for and anything you find, then the labor and parts as the work is done: the invoice is built from them."
                : "Nothing on the job yet. Add the work to do and anything you find, then the labor and parts as the work is done."}
            </p>
          }
        />
      )}

      {/* The missing-setting rule: until a labor rate is set, only an admin can enter labor, so
          the admin is told where to set it. */}
      {canInvoice && !frozen && settingsQ.data && settingsQ.data.laborRateCents == null && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Set a labor rate so technicians can log their hours.{" "}
          <Link to="/settings" search={{ tab: "shop-rates" } as never} className="font-medium underline-offset-2 hover:underline">
            Settings, Shop rates
          </Link>
        </div>
      )}
      {canInvoice && !frozen && w.status === "cancelled" && subtotal > 0 && (
        <p className="text-xs text-muted-foreground">This job was cancelled. Reopen it to raise its invoice.</p>
      )}
      {canInvoice && !frozen && !w.billTo && subtotal > 0 && (
        <p className="text-xs text-muted-foreground">Nobody is billed for this job. Edit the job and choose who pays to raise its invoice.</p>
      )}
      {canInvoice && !frozen && subtotal === 0 && lines.some((l) => l.billable && l.unitPriceCents * l.qty > 0) && (
        <p className="text-xs text-muted-foreground">Every line is discounted to nothing, so there is no invoice to raise.</p>
      )}

      <WorkOrderItemModal workOrder={w} open={addingItem != null} onOpenChange={(o) => !o && setAddingItem(null)} defaultSource={addingItem ?? "requested"} />
      <WorkOrderItemModal workOrder={w} open={editingItem != null} onOpenChange={(o) => !o && setEditingItem(null)} editing={editingItem} />
      <RecordOwnerAnswerModal workOrder={w} items={items} open={answering} onOpenChange={setAnswering} />
      <SignOffLinked workOrder={w} item={signing} onDone={() => setSigning(null)} />
      <WorkOrderLineModal
        workOrder={w}
        open={addingLine != null}
        onOpenChange={(o) => !o && setAddingLine(null)}
        defaultKind={addingLine?.kind ?? "labor"}
        defaultItemId={addingLine?.itemId ?? null}
      />
      <WorkOrderLineModal workOrder={w} open={editingLine != null} onOpenChange={(o) => !o && setEditingLine(null)} editing={editingLine} />
      {canInvoice && <RaiseInvoiceModal workOrder={w} open={raising} onOpenChange={setRaising} />}
    </div>
  );
}

/** A charge left off the bill: its amount struck through, so the desk sees what it would have been. */
function NotBilled({ cents }: { cents: number }) {
  return (
    <span className="text-muted-foreground">
      <span className="sr-only">Not billed, would have been </span>
      <s>{formatMoney(cents)}</s>
    </span>
  );
}

/** "Ann", "Ann and Bo", "Ann, Bo and Cy". */
function names(list: string[]): string {
  return list.length <= 1 ? (list[0] ?? "") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

const HOVER_LINK = "font-medium text-foreground underline underline-offset-2 hover:no-underline";

/**
 * What Send to owner will do, or why it cannot, for its hover card: who it asks, or the reason
 * nobody can be reached and the way to fix it (an owner, an address, or the answer recorded by
 * hand). `text` is the same as one plain sentence, for a screen reader.
 */
function explainSend(a: WorkOrderSendAudience, n: number, billedName: string | null, aircraftId: number, onAnswer?: () => void) {
  const it = n === 1 ? "it" : "these";
  const them = n === 1 ? "it" : "them";
  const ownersPanel = (label: string) => (
    <Link to="/aircraft/$resourceId" params={{ resourceId: String(aircraftId) }} search={{ tab: "owners" } as never} className={HOVER_LINK}>
      {label}
    </Link>
  );
  const answer = onAnswer ? (
    <button type="button" onClick={onAnswer} className={HOVER_LINK}>
      Record owner's answer
    </button>
  ) : null;
  const unreachable = a.notReached.map((x) => `${x.name} ${x.reason}.`).join(" ");
  if (a.blocked) {
    if (a.notReached.length) {
      return {
        text: `Nobody can be reached. ${unreachable}`,
        node: (
          <>
            <p className="font-medium">Nobody can be reached</p>
            <p className="text-muted-foreground">{unreachable}</p>
            <p>
              {ownersPanel(`Add an email on ${a.tail}`)}
              {answer && <> or call them and {answer}.</>}
            </p>
          </>
        ),
      };
    }
    if (a.you) {
      return {
        text: `You own ${a.tail}, so there is no one else to send ${it} to. Decide ${them} yourself with Record owner's answer.`,
        node: (
          <>
            <p className="font-medium">You own {a.tail}</p>
            <p className="text-muted-foreground">There is no one else to send {it} to.</p>
            {answer && <p>Decide {them} yourself with {answer}.</p>}
          </>
        ),
      };
    }
    return {
      text: `${a.tail} has no owner on record, so there is no one to send ${it} to.`,
      node: (
        <>
          <p className="font-medium">{a.tail} has no owner on record</p>
          <p className="text-muted-foreground">There is no one to send {it} to yet.</p>
          <p>{ownersPanel(`Add an owner on ${a.tail}`)}</p>
        </>
      ),
    };
  }
  const asks = `Asks ${names(a.reached)} to approve, decline or put off ${n === 1 ? "the finding" : `${n} findings`}.`;
  const prices = billedName ? `Prices go only to ${billedName}.` : "";
  return {
    text: [asks, prices, unreachable].filter(Boolean).join(" "),
    node: (
      <>
        <p>{asks}</p>
        {prices && <p className="text-muted-foreground">{prices}</p>}
        {unreachable && <p className="text-muted-foreground">{unreachable}</p>}
      </>
    ),
  };
}

/** Why the invoice cannot be raised, for the Raise invoice button's hover card, with the way to fix it. */
function explainRaise(err: ApiError, admin: boolean) {
  const code = (err.body as { code?: string } | null | undefined)?.code;
  if (code === "TAX_RATE_MISSING") {
    return {
      text: `${err.message}`,
      node: (
        <>
          <p className="font-medium">A taxable line has no sales tax rate</p>
          <p className="text-muted-foreground">Lines are marked taxable, but there is no rate to charge them at.</p>
          <p>
            {admin ? (
              <Link to="/settings" search={{ tab: "sales-tax" } as never} className={HOVER_LINK}>
                Set a sales tax rate
              </Link>
            ) : (
              "Ask an admin to set a sales tax rate in Settings, Sales tax"
            )}
            , or untick Taxable on the lines.
          </p>
        </>
      ),
    };
  }
  return { text: err.message, node: <p>{err.message}</p> };
}

/** A menu choice with its plain name first and what it means under it, so the names scan. */
function MenuChoice({ icon: Icon, title, hint }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string }) {
  return (
    <>
      {Icon && <Icon className="size-4 text-muted-foreground" />}
      <span className="shrink-0">{title}</span>
      {hint && <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{hint}</span>}
    </>
  );
}

const DECISIONS: NonNullable<WorkOrderItem["decision"]>[] = ["approved", "declined", "deferred"];

/** Where an item's answer stands, as its tag reads. */
function decisionTag(item: WorkOrderItem, customer: boolean): { label: string; dot: string } {
  return item.decision
    ? DECISION_TAG[item.decision]
    : item.done
      ? // Done without an answer: on the organization's own aircraft that is just done; a finding
        // sent and then done through its inspection or squawk was asked, and nobody answered.
        { label: !customer ? "Done" : item.sentToOwnerAt ? "Done, no answer" : "Done, not asked", dot: "var(--muted-foreground)" }
      : !customer
        ? { label: "Not decided", dot: "var(--muted-foreground)" }
        : item.sentToOwnerAt
          ? { label: "Sent, waiting", dot: "var(--warning)" }
          : { label: "Not sent yet", dot: "var(--muted-foreground)" };
}

/** The answer as a plain tag, on a job where it can no longer change (invoiced or closed), saying why. */
function DecisionTag({ item, customer, locked }: { item: WorkOrderItem; customer: boolean; locked: string }) {
  const tag = decisionTag(item, customer);
  return (
    <span className={LIST_TAG_CLASS} title={locked} aria-label={`${customer ? "Owner's answer" : "Decision"} on "${item.description}": ${tag.label}. ${locked}`}>
      <span className="size-1.5 rounded-full" style={{ background: tag.dot }} aria-hidden />
      {tag.label}
    </span>
  );
}

/**
 * The owner's answer as a tag that opens to change it, like a status in Linear. On the
 * organization's own aircraft it is the shop's own decision: no owner, no call to record.
 */
function DecisionMenu({
  item,
  customer,
  onPick,
  onFullCall,
}: {
  item: WorkOrderItem;
  /** A customer's aircraft: the owners are asked. The organization's own aircraft: it decides. */
  customer: boolean;
  onPick: (d: NonNullable<WorkOrderItem["decision"]>) => void;
  /** The full call dialog; absent where there is no owner to call. */
  onFullCall?: () => void;
}) {
  const tag = decisionTag(item, customer);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${customer ? "Owner's answer" : "Decision"} on "${item.description}": ${tag.label}`}
          className={cn(LIST_TAG_CLASS, LIST_TAG_BUTTON_CLASS)}
        >
          <span className="size-1.5 rounded-full" style={{ background: tag.dot }} aria-hidden />
          {tag.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{customer ? "The owner said" : "Decision"}</DropdownMenuLabel>
        {DECISIONS.map((d) => (
          <DropdownMenuItem key={d} onSelect={() => onPick(d)}>
            <span className="size-1.5 rounded-full" style={{ background: DECISION_TAG[d].dot }} aria-hidden />
            <span className="flex-1">{DECISION_TAG[d].label}</span>
            {item.decision === d && <Check className="size-3.5" />}
          </DropdownMenuItem>
        ))}
        {onFullCall && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onFullCall}>
              <Phone className="size-4" /> Record a call with notes…
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What to add, as a searchable list like the console's other pickers (Tony, 2026-09-30): type
 * "part" or "lab" and Enter. The work first, then the kinds of charge; a frozen (invoiced) job
 * takes no new charges.
 */
function AddMenu({
  frozen,
  customer,
  lineHint,
  onItem,
  onLine,
}: {
  frozen: boolean;
  /** A customer's aircraft, where the owner asks for work; the organization's own just has requests. */
  customer: boolean;
  lineHint: Partial<Record<WorkOrderLineCategory, string>>;
  onItem: (source: WorkOrderItem["source"]) => void;
  onLine: (kind: WorkOrderLineCategory) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="size-4" /> Add
        </Button>
      </PopoverTrigger>
      {/* Read like the shared Combobox (Tony, 2026-09-30): one row each, an icon, the name, what
          it means beside it, headings pinned as the list scrolls, taller on a taller screen. */}
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder="Add a finding, labor, a part…" />
          <CommandList className={TALL_LIST_CLASS}>
            <CommandEmpty>Nothing called that.</CommandEmpty>
            <CommandGroup heading="Work" className={STICKY_GROUP_CLASS}>
              <CommandItem value={customer ? "owner's request something the owner asked for requested" : "request something asked for requested"} onSelect={() => pick(() => onItem("requested"))}>
                <MenuChoice icon={UserRound} title={customer ? "Owner's request" : "Request"} />
              </CommandItem>
              <CommandItem value="finding something the shop found found" onSelect={() => pick(() => onItem("found"))}>
                <MenuChoice icon={ScanSearch} title="Finding" />
              </CommandItem>
            </CommandGroup>
            {!frozen && (
              <CommandGroup heading="Charges" className={STICKY_GROUP_CLASS}>
                {LINE_KINDS.map((k) => (
                  <CommandItem key={k.value} value={`${k.label} ${lineHint[k.value] ?? ""} ${k.value}`} onSelect={() => pick(() => onLine(k.value))}>
                    <MenuChoice icon={LINE_KIND_ICON[k.value]} title={k.label} />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
