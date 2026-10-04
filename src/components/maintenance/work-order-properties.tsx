import * as React from "react";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { useMembers, useReservations, useResource, useResourceOwners, useUpdateWorkOrder } from "@/features/queries";
import type { WorkOrder, WorkOrderInput } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { cn, formatDate } from "@/lib/utils";
import { useTimeZone } from "@/lib/use-timezone";
import { isOpenWorkOrder, parseTenths, tenthsLabel, workOrderAircraftName } from "@/lib/work-orders";
import { useConfirm } from "@/components/confirm-dialog";
import { Combobox, MultiCombobox, type ComboOption } from "@/components/combobox";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { PersonAvatar, WorkspaceUserAvatar } from "@/components/workspace-user-avatar";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

/**
 * The job's details, each changed where it is shown (Tony, 2026-09-30): no Edit dialog holding
 * every field at once. A property is a row you click; it opens the one control it needs and saves
 * when you pick. Who pays is an admin's, and fixed once the job is invoiced (the server's rules).
 */

const NOBODY = "none";
const BOOKING_LOOKBACK_DAYS = 30;
const BOOKING_LOOKAHEAD_DAYS = 120;

/** A label and a value; the value is a button when it can be changed. */
function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 py-0.5 text-[13px]">
      <span className="pt-1.5 text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** What a changeable property looks like at rest: quiet until hovered, like an issue's sidebar. */
const valueButton =
  "flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent";

function Value({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <span className={cn("block min-h-8 px-0 py-1.5", muted && "text-muted-foreground")}>{children}</span>;
}

export function WorkOrderDetailsCard({
  workOrder: w,
  metersPrompt,
  onMetersPromptClose,
}: {
  workOrder: WorkOrder;
  /** The aircraft's readings, when the Stage menu has just moved the job into the shop. */
  metersPrompt?: { hobbs: number | null; tach: number | null } | null;
  onMetersPromptClose?: () => void;
}) {
  const update = useUpdateWorkOrder();
  const { roles } = useAuth();
  const tz = useTimeZone();
  const save = React.useCallback(
    async (patch: WorkOrderInput, done?: string) => {
      try {
        await update.mutateAsync({ id: w.id, ...patch });
        if (done) toast.success(done);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save the change");
        return false;
      }
    },
    [update, w.id]
  );
  const day = (iso: string | null | undefined) => (iso ? formatDate(iso, "MMM d, yyyy", "") : "");
  const invoiced = (w.billing ?? "none") !== "none" || !!w.invoice;
  const mayChooseBillTo = isAdmin(roles) && !invoiced;

  return (
    <DetailCard title="Details" docShot="work-order-details">
      <div className="-mt-1 space-y-0.5">
        <PropertyRow label="Billed to">
          <BillToProperty workOrder={w} editable={mayChooseBillTo} locked={invoiced ? "Invoiced: void the invoice to change who pays." : !isAdmin(roles) ? "An admin chooses who pays." : null} onSave={save} />
        </PropertyRow>
        <PropertyRow label="Promised back">
          <PromisedProperty workOrder={w} onSave={save} />
        </PropertyRow>
        <PropertyRow label="Technicians">
          <TechniciansProperty workOrder={w} onSave={save} />
        </PropertyRow>
        <MetersProperty workOrder={w} prompt={metersPrompt ?? null} onPromptClose={onMetersPromptClose} onSave={save} />
        <PropertyRow label="Booked for">
          <BookingProperty workOrder={w} onSave={save} />
        </PropertyRow>
        <div className="my-2 border-t border-border" />
        <PropertyRow label="Opened">
          <Value>{day(w.openedAt)}</Value>
        </PropertyRow>
        <PropertyRow label="Received">
          <Value muted={!w.receivedAt}>{day(w.receivedAt) || "Not here yet"}</Value>
        </PropertyRow>
        {w.completedAt && (
          <PropertyRow label="Completed">
            <Value>{day(w.completedAt)}</Value>
          </PropertyRow>
        )}
        {w.status === "cancelled" && w.closedAt && (
          <PropertyRow label="Cancelled">
            <Value>{day(w.closedAt)}</Value>
          </PropertyRow>
        )}
        {w.createdBy?.name && (
          <PropertyRow label="Opened by">
            <span className="flex min-h-8 items-center">
              <WorkspaceUserAvatar person={w.createdBy} showName />
            </span>
          </PropertyRow>
        )}
      </div>
      {/* For a reader in another zone, the booking's times are the airport's. */}
      {w.booking && !w.booking.cancelled && !w.booking.moved && tz.differs(w.booking.start) && (
        <p className="mt-2 text-[11px] text-muted-foreground">Times are {tz.label(w.booking.start)}, the airport's.</p>
      )}
    </DetailCard>
  );
}

type Save = (patch: WorkOrderInput, done?: string) => Promise<boolean>;

function BillToProperty({ workOrder: w, editable, locked, onSave }: { workOrder: WorkOrder; editable: boolean; locked: string | null; onSave: Save }) {
  const ownersQ = useResourceOwners(editable ? w.aircraft.id : undefined, { enabled: editable });
  const membersQ = useMembers(undefined, { enabled: editable });
  const options: ComboOption[] = React.useMemo(() => {
    const owners = ownersQ.data ?? [];
    const ownerIds = new Set(owners.map((o) => o.orgUser.id));
    const memberIds = new Set((membersQ.data ?? []).map((m) => m.id));
    const current = w.billTo && !ownerIds.has(w.billTo.id) && !memberIds.has(w.billTo.id) ? w.billTo : null;
    return [
      { value: NOBODY, label: "Nobody", hint: w.aircraft.use === "shop" ? "Nobody pays yet" : "The organization's own aircraft" },
      ...(current ? [{ value: String(current.id), label: current.name ?? "Currently billed", group: "Currently billed" }] : []),
      ...owners.map((o) => ({ value: String(o.orgUser.id), label: o.orgUser.user.name ?? "Owner", hint: o.isPrimary ? "Owner, billed" : "Owner", group: "Owners of this aircraft" })),
      ...(membersQ.data ?? []).filter((m) => !ownerIds.has(m.id)).map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}`, group: "Everyone else" })),
    ];
  }, [ownersQ.data, membersQ.data, w.billTo, w.aircraft.use]);

  if (!editable) {
    return (
      <span className="flex min-h-8 items-center gap-1.5" title={locked ?? undefined}>
        {w.billTo ? <WorkspaceUserAvatar person={w.billTo} showName /> : <span className="text-muted-foreground">Nobody</span>}
      </span>
    );
  }
  return (
    <Combobox
      options={options}
      value={w.billTo ? String(w.billTo.id) : NOBODY}
      onChange={(v) => void onSave({ billToOrgUserId: v === NOBODY ? null : Number(v) }, "Who pays is changed")}
      searchPlaceholder="Search people…"
      contentClassName="w-72"
      trigger={
        <button type="button" className={valueButton} aria-label="Change who pays">
          {w.billTo ? (
            <>
              <PersonAvatar name={w.billTo.name ?? "Owner"} />
              <span className="truncate">{w.billTo.name ?? "Owner"}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Nobody</span>
          )}
        </button>
      }
    />
  );
}

function PromisedProperty({ workOrder: w, onSave }: { workOrder: WorkOrder; onSave: Save }) {
  const [open, setOpen] = React.useState(false);
  const selected = w.promisedOn ? parseISO(w.promisedOn) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={valueButton} aria-label="Change when it is promised back">
          {selected ? format(selected, "MMM d, yyyy") : <span className="text-muted-foreground">Not promised</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            if (!d) return;
            setOpen(false);
            void onSave({ promisedOn: format(d, "yyyy-MM-dd") });
          }}
        />
        {selected && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => {
                setOpen(false);
                void onSave({ promisedOn: null });
              }}
            >
              Not promised
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TechniciansProperty({ workOrder: w, onSave }: { workOrder: WorkOrder; onSave: Save }) {
  const membersQ = useMembers();
  const [values, setValues] = React.useState(() => w.technicians.map((t) => String(t.id)));
  // Follows the job (another desk, a refresh) except while the picker holds unsaved toggles.
  const key = w.technicians.map((t) => t.id).join(",");
  React.useEffect(() => setValues(key ? key.split(",") : []), [key]);
  const options: ComboOption[] = React.useMemo(() => {
    const eligible = (membersQ.data ?? []).filter((m) => !m.external && m.technicianRole).map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}` }));
    const listed = new Set(eligible.map((o) => o.value));
    // Somebody on the job who has since lost the role stays listed, so they can be taken off.
    const stale = w.technicians.filter((t) => !listed.has(String(t.id))).map((t) => ({ value: String(t.id), label: t.name ?? `Member #${t.id}`, hint: "No longer a technician" }));
    return [...eligible, ...stale];
  }, [membersQ.data, w.technicians]);
  const names = w.technicians.map((t) => t.name ?? "Technician");
  return (
    <MultiCombobox
      options={options}
      values={values}
      onChange={(next) => {
        setValues(next);
        void onSave({ technicianOrgUserIds: next.map(Number) });
      }}
      searchPlaceholder="Search technicians…"
      contentClassName="w-64"
      trigger={
        <button type="button" className={valueButton} aria-label="Change the technicians">
          {names.length ? (
            <>
              <span className="flex shrink-0">
                {w.technicians.slice(0, 3).map((t, i) => (
                  <PersonAvatar key={t.id} name={t.name ?? "Technician"} className={cn("ring-2 ring-card", i > 0 && "-ml-1.5")} />
                ))}
              </span>
              <span className="truncate">{names.join(", ")}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Nobody assigned</span>
          )}
        </button>
      }
    />
  );
}

function BookingProperty({ workOrder: w, onSave }: { workOrder: WorkOrder; onSave: Save }) {
  const tz = useTimeZone();
  const window = React.useMemo(() => {
    const d = 86_400_000;
    const now = Date.now();
    return { from: new Date(now - BOOKING_LOOKBACK_DAYS * d).toISOString(), to: new Date(now + BOOKING_LOOKAHEAD_DAYS * d).toISOString() };
  }, []);
  const [opened, setOpened] = React.useState(false);
  const bookingsQ = useReservations(window.from, window.to, { resourceId: w.aircraft.id }, { enabled: opened });
  const when = (start: string, end: string) =>
    `${tz.date(start)}, ${tz.time(start)} to ${tz.spansDays(start, end) ? `${tz.date(end)}, ` : ""}${tz.time(end)}`;
  const options: ComboOption[] = React.useMemo(() => {
    const list: ComboOption[] = (bookingsQ.data ?? []).filter((r) => r.type === "maintenance" && !r.cancelledAt).map((r) => ({ value: String(r.id), label: when(r.start, r.end) }));
    const linked = w.booking;
    if (linked && !list.some((o) => o.value === String(linked.id))) {
      list.unshift({ value: String(linked.id), label: linked.cancelled ? "Cancelled booking" : linked.moved ? "Moved off this aircraft" : when(linked.start, linked.end) });
    }
    return [{ value: NOBODY, label: "Not booked", hint: "No maintenance booking on the schedule" }, ...list];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingsQ.data, w.booking, tz]);
  const label = !w.booking
    ? null
    : w.booking.cancelled
      ? "Cancelled booking"
      : w.booking.moved
        ? "Moved off this aircraft"
        : when(w.booking.start, w.booking.end);
  return (
    <Combobox
      options={options}
      value={w.booking ? String(w.booking.id) : NOBODY}
      onChange={(v) => void onSave({ reservationId: v === NOBODY ? null : Number(v) })}
      searchPlaceholder="Search bookings…"
      emptyText="No maintenance bookings on this aircraft."
      contentClassName="w-80"
      trigger={
        <button type="button" className={valueButton} aria-label="Change the booking" onPointerDown={() => setOpened(true)} onFocus={() => setOpened(true)}>
          {label ? <span className={cn("truncate", (w.booking?.cancelled || w.booking?.moved) && "text-muted-foreground")}>{label}</span> : <span className="text-muted-foreground">Not booked</span>}
        </button>
      }
    />
  );
}

/**
 * The Hobbs and tach in and out, changed together in one small form: they are read off the same
 * panel, and the checks compare them with each other and with the aircraft. A reading lower than
 * the aircraft's, or out below in, is asked about before it saves (a slipped digit), not refused
 * (a replaced meter does read lower). Before the aircraft arrives there is nothing to read.
 */
function MetersProperty({
  workOrder: w,
  prompt,
  onPromptClose,
  onSave,
}: {
  workOrder: WorkOrder;
  prompt: { hobbs: number | null; tach: number | null } | null;
  onPromptClose?: () => void;
  onSave: Save;
}) {
  const meters = w.aircraft.meterMode ?? "hobbs_and_tach";
  const hasHobbs = meters === "hobbs_and_tach" || meters === "hobbs_only";
  const hasTach = meters === "hobbs_and_tach" || meters === "tach_only";
  const notHere = w.status === "requested" || w.status === "scheduled";
  const [open, setOpen] = React.useState(false);
  const planeQ = useResource(open || prompt ? w.aircraft.id : null);
  const plane = planeQ.data?.type?.plane ?? null;
  const confirm = useConfirm();
  const [hobbsIn, setHobbsIn] = React.useState("");
  const [tachIn, setTachIn] = React.useState("");
  const [hobbsOut, setHobbsOut] = React.useState("");
  const [tachOut, setTachOut] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const seed = React.useCallback(
    (fromAircraft: { hobbs: number | null; tach: number | null } | null) => {
      setHobbsIn(tenthsLabel(w.hobbsIn ?? (fromAircraft?.hobbs || null)));
      setTachIn(tenthsLabel(w.tachIn ?? (fromAircraft?.tach || null)));
      setHobbsOut(tenthsLabel(w.hobbsOut));
      setTachOut(tenthsLabel(w.tachOut));
      setShowErrors(false);
    },
    [w.hobbsIn, w.tachIn, w.hobbsOut, w.tachOut]
  );
  // The Stage menu moved the job into the shop with no readings: open here, filled in from the aircraft.
  React.useEffect(() => {
    if (!prompt) return;
    seed(prompt);
    setOpen(true);
  }, [prompt, seed]);

  const close = (o: boolean) => {
    setOpen(o);
    if (!o && prompt) onPromptClose?.();
  };

  const fields = [
    hasHobbs && { id: "wo-meter-hobbs-in", label: "Hobbs in", value: hobbsIn, set: setHobbsIn },
    hasHobbs && { id: "wo-meter-hobbs-out", label: "Hobbs out", value: hobbsOut, set: setHobbsOut },
    hasTach && { id: "wo-meter-tach-in", label: "Tach in", value: tachIn, set: setTachIn },
    hasTach && { id: "wo-meter-tach-out", label: "Tach out", value: tachOut, set: setTachOut },
  ].filter(Boolean) as { id: string; label: string; value: string; set: (v: string) => void }[];
  const bad = fields.some((f) => parseTenths(f.value) === undefined);

  async function submit() {
    if (bad) {
      setShowErrors(true);
      return;
    }
    const now = { hobbsIn: parseTenths(hobbsIn) ?? null, tachIn: parseTenths(tachIn) ?? null, hobbsOut: parseTenths(hobbsOut) ?? null, tachOut: parseTenths(tachOut) ?? null };
    const recorded = { hobbs: plane?.hobbsTime || null, tach: plane?.tachTime || null };
    const tail = workOrderAircraftName(w);
    // Only readings typed now are questioned: an old job's readings are not asked about again.
    const doubts: string[] = [];
    if (hasHobbs && now.hobbsIn != null && now.hobbsIn !== (w.hobbsIn ?? null) && recorded.hobbs != null && now.hobbsIn < recorded.hobbs) {
      doubts.push(`Hobbs in ${tenthsLabel(now.hobbsIn)} is lower than the ${tenthsLabel(recorded.hobbs)} recorded for ${tail}.`);
    }
    if (hasTach && now.tachIn != null && now.tachIn !== (w.tachIn ?? null) && recorded.tach != null && now.tachIn < recorded.tach) {
      doubts.push(`Tach in ${tenthsLabel(now.tachIn)} is lower than the ${tenthsLabel(recorded.tach)} recorded for ${tail}.`);
    }
    if (hasHobbs && now.hobbsOut != null && now.hobbsIn != null && now.hobbsOut < now.hobbsIn && (now.hobbsOut !== (w.hobbsOut ?? null) || now.hobbsIn !== (w.hobbsIn ?? null))) {
      doubts.push(`Hobbs out ${tenthsLabel(now.hobbsOut)} is lower than Hobbs in ${tenthsLabel(now.hobbsIn)}.`);
    }
    if (hasTach && now.tachOut != null && now.tachIn != null && now.tachOut < now.tachIn && (now.tachOut !== (w.tachOut ?? null) || now.tachIn !== (w.tachIn ?? null))) {
      doubts.push(`Tach out ${tenthsLabel(now.tachOut)} is lower than tach in ${tenthsLabel(now.tachIn)}.`);
    }
    if (doubts.length) {
      const ok = await confirm({
        title: "Check the meter readings",
        description: `${doubts.join(" ")} Save them anyway only if that is what the meters say, for example after a meter was replaced.`,
        confirmLabel: "Save anyway",
        cancelLabel: "Fix them",
      });
      if (!ok) return;
    }
    const patch: WorkOrderInput = {};
    if (hasHobbs && now.hobbsIn !== (w.hobbsIn ?? null)) patch.hobbsIn = now.hobbsIn;
    if (hasHobbs && now.hobbsOut !== (w.hobbsOut ?? null)) patch.hobbsOut = now.hobbsOut;
    if (hasTach && now.tachIn !== (w.tachIn ?? null)) patch.tachIn = now.tachIn;
    if (hasTach && now.tachOut !== (w.tachOut ?? null)) patch.tachOut = now.tachOut;
    if (!Object.keys(patch).length) return close(false);
    setSaving(true);
    const saved = await onSave(patch);
    setSaving(false);
    if (saved) close(false);
  }

  if (!hasHobbs && !hasTach) return null;
  const reading = (inV: number | null | undefined, outV: number | null | undefined) => `${tenthsLabel(inV) || "–"} / ${tenthsLabel(outV) || "–"}`;

  if (notHere && w.hobbsIn == null && w.tachIn == null) {
    return (
      <PropertyRow label="Meters">
        <Value muted>Recorded when it arrives</Value>
      </PropertyRow>
    );
  }
  return (
    <Popover open={open} onOpenChange={(o) => (o ? (seed(null), setOpen(true)) : close(false))}>
      <PopoverTrigger asChild>
        <button type="button" className="-ml-2 block w-[calc(100%+0.5rem)] rounded-md text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring" aria-label="Change the meter readings">
          {hasHobbs && (
            <span className="ml-2 grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 py-1.5 pr-2 text-[13px]">
              <span className="text-muted-foreground">Hobbs in / out</span>
              <span className="tnum">{reading(w.hobbsIn, w.hobbsOut)}</span>
            </span>
          )}
          {hasTach && (
            <span className="ml-2 grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-2 py-1.5 pr-2 text-[13px]">
              <span className="text-muted-foreground">Tach in / out</span>
              <span className="tnum">{reading(w.tachIn, w.tachOut)}</span>
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 space-y-3"
        data-testid="meters-editor"
        // Opened by the Stage menu, which hands focus back to itself as it closes: that is not the
        // person leaving the readings. A click elsewhere, Escape or Cancel still closes it.
        onFocusOutside={(e) => e.preventDefault()}
      >
        {prompt && (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[12px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            The aircraft is here. Check the readings in against its meters, then save.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={f.id} className="text-[12px]">
                {f.label}
              </Label>
              <Input
                id={f.id}
                inputMode="decimal"
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder="1234.5"
                className="h-8 tnum"
                aria-invalid={showErrors && parseTenths(f.value) === undefined}
              />
            </div>
          ))}
        </div>
        {plane && (plane.hobbsTime || plane.tachTime) ? (
          <p className="text-[11px] text-muted-foreground">
            The aircraft last read{hasHobbs && plane.hobbsTime ? ` Hobbs ${tenthsLabel(plane.hobbsTime)}` : ""}
            {hasHobbs && hasTach && plane.hobbsTime && plane.tachTime ? "," : ""}
            {hasTach && plane.tachTime ? ` tach ${tenthsLabel(plane.tachTime)}` : ""}.
          </p>
        ) : null}
        {showErrors && bad && <p className="text-xs text-destructive">A reading is a number in tenths, like 1234.5.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A card of free text the shop writes (the request, the notes): read as text, changed in place.
 * Saved with Save, never as it is typed, so a stray click cannot change what the owner is sent.
 */
export function EditableTextCard({
  title,
  description,
  value,
  emptyText,
  placeholder,
  maxLength,
  docShot,
  docs,
  onSave,
}: {
  title: string;
  description?: string;
  value: string | null | undefined;
  emptyText: string;
  placeholder?: string;
  maxLength: number;
  docShot?: string;
  docs?: React.ComponentProps<typeof DocsHint>["topic"];
  onSave: (value: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const text = value?.trim() ?? "";
  const start = () => {
    setDraft(text);
    setEditing(true);
  };
  async function save() {
    const next = draft.trim();
    if (next === text) return setEditing(false);
    setSaving(true);
    const ok = await onSave(next || null);
    setSaving(false);
    if (ok) setEditing(false);
  }
  return (
    <DetailCard
      title={
        docs ? (
          <span className="inline-flex items-center gap-1">
            {title}
            <DocsHint topic={docs} />
          </span>
        ) : (
          title
        )
      }
      description={description}
      docShot={docShot}
      action={
        !editing && (
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Edit ${title.toLowerCase()}`} onClick={start}>
            <Pencil className="size-3.5" />
          </Button>
        )
      }
    >
      {editing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void save();
            }}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={4}
            className="text-[13px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      ) : text ? (
        <button type="button" onClick={start} className="-m-1 block w-[calc(100%+0.5rem)] rounded-md p-1 text-left hover:bg-accent/60" aria-label={`Edit ${title.toLowerCase()}`}>
          <span className="block whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">{text}</span>
        </button>
      ) : (
        <button type="button" onClick={start} className="-m-1 block w-[calc(100%+0.5rem)] rounded-md p-1 text-left hover:bg-accent/60">
          <CardEmpty>{emptyText}</CardEmpty>
        </button>
      )}
    </DetailCard>
  );
}

export { isOpenWorkOrder };
