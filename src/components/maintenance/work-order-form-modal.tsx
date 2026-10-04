import * as React from "react";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useCreateWorkOrder,
  useLocations,
  useMembers,
  usePlanes,
  useReservations,
  useResourceOwners,
  useUpdateWorkOrder,
  useResource,
} from "@/features/queries";
import { resourceLabel, type Resource, type WorkOrder, type WorkOrderInput, type WorkOrderStatus } from "@/types/api";
import {
  IN_SHOP_STATUSES,
  parseTenths,
  tenthsLabel,
  WORK_ORDER_STATUS_OPTIONS,
  workOrderAircraftName,
} from "@/lib/work-orders";
import { ResponsiveModal } from "@/components/responsive-modal";
import { useAuth } from "@/lib/auth";
import { canManageResources, isAdmin } from "@/lib/permissions";
import { AircraftFormModal } from "@/components/aircraft/aircraft-form";
import { Combobox, MultiCombobox, type ComboOption } from "@/components/combobox";
import { DatePickerField } from "@/components/date-picker";
import { Field } from "@/components/settings/parts";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTimeZone } from "@/lib/use-timezone";

/** The bill-to picker's value for "nobody": the school's own aircraft. */
const NOBODY = "none";

/** How far back and ahead the booking picker looks for the aircraft's maintenance bookings. */
const BOOKING_LOOKBACK_DAYS = 30;
const BOOKING_LOOKAHEAD_DAYS = 120;

/** A new job starts in one of these; the rest are reached from the job itself. */
const OPENING_STAGES: WorkOrderStatus[] = ["requested", "scheduled", "received"];

/**
 * Open a work order, or change one. One form for both, like the booking form: the fields are
 * the same facts either way, and two forms drift.
 *
 * Opening asks only what the desk knows when the owner calls or taxis up: which aircraft, who
 * pays, what they want, when it is promised back, and the meters if it is here. Notes and the
 * meters out belong to the job once it exists, so they are on the edit form only.
 */
export function WorkOrderFormModal({
  open,
  onOpenChange,
  editing,
  fixedResource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The job being changed. Absent opens a new one. */
  editing?: WorkOrder | null;
  /**
   * Opened from an aircraft's page: the tail is decided by where you clicked, and the aircraft
   * (its meters and which meters it has) comes with it, like the squawk and inspection forms.
   */
  fixedResource?: Resource | null;
}) {
  const once = useSubmitOnce(open);
  const confirm = useConfirm();
  const fixedResourceId = fixedResource?.id ?? null;
  const navigate = useNavigate();
  const create = useCreateWorkOrder();
  // Who pays is an admin's to choose. A technician's job goes to the aircraft's owner.
  const { roles } = useAuth();
  const mayChooseBillTo = isAdmin(roles);
  const update = useUpdateWorkOrder();
  const planesQ = usePlanes({ scope: "all" }, { enabled: open && !editing && !fixedResourceId });
  // The customer's aircraft is often not on file yet when they call: it is added from here, and
  // the job picks it, rather than leaving for the Aircraft page and coming back (Tony, 2026-09-30).
  const mayAddAircraft = canManageResources(roles) && !editing && !fixedResourceId;
  const locationsQ = useLocations({ enabled: open && mayAddAircraft });
  const [addingAircraft, setAddingAircraft] = React.useState<string | null>(null);
  // An existing job's aircraft, for its meters when Edit moves the job into the shop.
  const editedPlaneQ = useResource(editing ? editing.aircraft.id : null, { enabled: open && !!editing });
  const membersQ = useMembers(undefined, { enabled: open });

  const [resourceId, setResourceId] = React.useState<string>("");
  const [status, setStatus] = React.useState<WorkOrderStatus>("requested");
  const [complaint, setComplaint] = React.useState("");
  const [billTo, setBillTo] = React.useState<string>("");
  const [promisedOn, setPromisedOn] = React.useState("");
  const [hobbsIn, setHobbsIn] = React.useState("");
  const [tachIn, setTachIn] = React.useState("");
  const [hobbsOut, setHobbsOut] = React.useState("");
  const [tachOut, setTachOut] = React.useState("");
  const [technicians, setTechnicians] = React.useState<string[]>([]);
  const [customerNotes, setCustomerNotes] = React.useState("");
  const [internalNotes, setInternalNotes] = React.useState("");
  const [bookingId, setBookingId] = React.useState<string>(NOBODY);
  const [showErrors, setShowErrors] = React.useState(false);
  // The bill-to is filled from the aircraft's owner until the person picks one themselves.
  const billToTouched = React.useRef(false);
  // Which job (or new form) the fields were loaded for. The job page hands this form LIVE data,
  // and a refetch (another desk's change, a realtime refresh) must not reload the fields under
  // somebody halfway through typing.
  const seededFor = React.useRef<string | null>(null);
  // The job as it was when the form opened: an edit sends only what the person changed, so saving
  // a stale form cannot quietly put back a stage another desk has moved on.
  const snapshot = React.useRef<Record<string, unknown>>({});

  const effectiveResourceId = editing ? editing.aircraft.id : fixedResourceId ?? (resourceId ? Number(resourceId) : null);
  const ownersQ = useResourceOwners(effectiveResourceId ?? undefined, { enabled: open && effectiveResourceId != null });

  // The aircraft's maintenance bookings, for the one holding the aircraft for this job.
  const tz = useTimeZone();
  const bookingWindow = React.useMemo(() => {
    const day = 86_400_000;
    const now = Date.now();
    return { from: new Date(now - BOOKING_LOOKBACK_DAYS * day).toISOString(), to: new Date(now + BOOKING_LOOKAHEAD_DAYS * day).toISOString() };
  }, []);
  const bookingsQ = useReservations(
    bookingWindow.from,
    bookingWindow.to,
    effectiveResourceId ? { resourceId: effectiveResourceId } : undefined,
    { enabled: open && effectiveResourceId != null }
  );

  // Load the job (or a blank form) each time the dialog opens, and only then.
  React.useEffect(() => {
    if (!open) {
      seededFor.current = null;
      return;
    }
    const key = `${editing?.id ?? "new"}:${fixedResourceId ?? ""}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    billToTouched.current = !!editing;
    setShowErrors(false);
    setResourceId(fixedResourceId ? String(fixedResourceId) : "");
    setStatus(editing?.status ?? "requested");
    setComplaint(editing?.complaint ?? "");
    setBillTo(editing ? (editing.billTo ? String(editing.billTo.id) : NOBODY) : "");
    setPromisedOn(editing?.promisedOn ?? "");
    setHobbsIn(tenthsLabel(editing?.hobbsIn));
    setTachIn(tenthsLabel(editing?.tachIn));
    setHobbsOut(tenthsLabel(editing?.hobbsOut));
    setTachOut(tenthsLabel(editing?.tachOut));
    setTechnicians(editing ? editing.technicians.map((t) => String(t.id)) : []);
    setCustomerNotes(editing?.customerNotes ?? "");
    setInternalNotes(editing?.internalNotes ?? "");
    setBookingId(editing?.booking ? String(editing.booking.id) : NOBODY);
    snapshot.current = editing ? bodyOf(editing) : {};
  }, [open, editing, fixedResourceId]);

  const plane = React.useMemo(() => {
    if (editing) return editedPlaneQ.data?.type?.plane ?? null;
    if (fixedResource) return fixedResource.type?.plane ?? null;
    const r = (planesQ.data ?? []).find((p) => p.id === effectiveResourceId);
    return r?.type?.plane ?? null;
  }, [editing, editedPlaneQ.data, fixedResource, planesQ.data, effectiveResourceId]);
  const shopAircraft =
    editing?.aircraft.use === "shop" ||
    fixedResource?.use === "shop" ||
    (planesQ.data ?? []).find((p) => p.id === effectiveResourceId)?.use === "shop";

  // Default the person billed to the aircraft's primary owner (the Billed badge on its Owners
  // panel), or nobody for the school's own aircraft. Recomputed when the aircraft changes.
  React.useEffect(() => {
    if (!open || editing || billToTouched.current) return;
    const primary = (ownersQ.data ?? []).find((o) => o.isPrimary);
    setBillTo(primary ? String(primary.orgUser.id) : ownersQ.isSuccess ? NOBODY : "");
  }, [open, editing, ownersQ.data, ownersQ.isSuccess]);

  // Prefill the meters in from the aircraft when it is here, the way close-out does. What the
  // prefill wrote is remembered, so choosing a stage where it has not arrived takes back only
  // those values: an arrival reading on a job that is not here is wrong, one typed stays.
  const autoFilled = React.useRef<{ hobbs?: string; tach?: string }>({});
  // An existing job too: one moved into the shop through Edit, or one already here whose meters
  // nobody recorded. A reading of nothing (0 on an aircraft whose meters were never entered) is
  // not a reading, so it is never filled in.
  React.useEffect(() => {
    if (!open || !plane) return;
    if ((IN_SHOP_STATUSES as readonly string[]).includes(status)) {
      const hobbs = plane.hobbsTime ? tenthsLabel(plane.hobbsTime) : "";
      const tach = plane.tachTime ? tenthsLabel(plane.tachTime) : "";
      setHobbsIn((v) => {
        if (v) return v;
        autoFilled.current.hobbs = hobbs;
        return hobbs;
      });
      setTachIn((v) => {
        if (v) return v;
        autoFilled.current.tach = tach;
        return tach;
      });
    } else {
      // Read the remembered values NOW: the updaters run on the next render, after the reset.
      const filled = autoFilled.current;
      autoFilled.current = {};
      setHobbsIn((v) => (v && v === filled.hobbs ? "" : v));
      setTachIn((v) => (v && v === filled.tach ? "" : v));
    }
  }, [open, plane, status]);

  const aircraftOptions: ComboOption[] = React.useMemo(
    () =>
      (planesQ.data ?? [])
        .filter((r) => r.type?.plane)
        .map((r) => ({ value: String(r.id), label: resourceLabel(r).name, hint: r.use === "shop" ? "Customer" : "Fleet" })),
    [planesQ.data]
  );

  const billToOptions: ComboOption[] = React.useMemo(() => {
    const owners = ownersQ.data ?? [];
    const ownerIds = new Set(owners.map((o) => o.orgUser.id));
    const memberIds = new Set((membersQ.data ?? []).map((m) => m.id));
    // Somebody the job is billed to who is no longer an owner or a current member still has to
    // show as who is billed, not as an empty "Pick who pays".
    const current = editing?.billTo && !ownerIds.has(editing.billTo.id) && !memberIds.has(editing.billTo.id) ? editing.billTo : null;
    return [
      { value: NOBODY, label: "Nobody", hint: shopAircraft ? "Nobody pays yet" : "The organization's own aircraft" },
      ...(current ? [{ value: String(current.id), label: current.name ?? "Currently billed", group: "Currently billed" }] : []),
      ...owners.map((o) => ({
        value: String(o.orgUser.id),
        label: o.orgUser.user.name ?? "Owner",
        hint: o.isPrimary ? "Owner, billed" : "Owner",
        group: "Owners of this aircraft",
      })),
      ...(membersQ.data ?? [])
        .filter((m) => !ownerIds.has(m.id))
        .map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}`, group: "Everyone else" })),
    ];
  }, [ownersQ.data, membersQ.data, editing, shopAircraft]);

  const technicianOptions: ComboOption[] = React.useMemo(() => {
    const eligible = (membersQ.data ?? [])
      // The technician role only: an admin who does the work holds it too.
      .filter((m) => !m.external && m.technicianRole)
      .map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}` }));
    // Somebody already on the job who has since left or lost the role stays listed, so they can be
    // taken off; the server keeps them without re-checking and only refuses NEW assignments.
    const listed = new Set(eligible.map((o) => o.value));
    const stale = (editing?.technicians ?? [])
      .filter((t) => !listed.has(String(t.id)))
      .map((t) => ({ value: String(t.id), label: t.name ?? `Member #${t.id}`, hint: "No longer a technician" }));
    return [...eligible, ...stale];
  }, [membersQ.data, editing]);

  const bookingOptions = React.useMemo(() => {
    const when = (start: string, end: string) =>
      `${tz.date(start)}, ${tz.time(start)} to ${tz.spansDays(start, end) ? `${tz.date(end)}, ` : ""}${tz.time(end)}${tz.differs(start) ? ` ${tz.label(start)}` : ""}`;
    const list = (bookingsQ.data ?? [])
      .filter((r) => r.type === "maintenance" && !r.cancelledAt)
      .map((r) => ({ value: String(r.id), label: when(r.start, r.end) }));
    // The linked booking stays listed when it is outside the window or has since been cancelled.
    const linked = editing?.booking;
    if (linked && !list.some((o) => o.value === String(linked.id))) {
      list.unshift({
        value: String(linked.id),
        label: linked.cancelled ? "Cancelled booking" : linked.moved ? "Moved off this aircraft" : when(linked.start, linked.end),
      });
    }
    return list;
  }, [bookingsQ.data, editing?.booking, tz]);

  const meters = editing?.aircraft.meterMode ?? plane?.meterMode ?? "hobbs_and_tach";
  const hasHobbs = meters === "hobbs_and_tach" || meters === "hobbs_only";
  const hasTach = meters === "hobbs_and_tach" || meters === "tach_only";

  const readings = { hobbsIn, tachIn, hobbsOut, tachOut };
  // A reading out below the one in is usually a slipped digit, but a meter replaced during the
  // work reads lower on the way out, so it is a warning, not a refusal.
  const lowerOut = (inText: string, outText: string) => {
    const a = parseTenths(inText);
    const b = parseTenths(outText);
    return a != null && b != null && b < a;
  };
  const badReading = Object.entries(readings).find(([, v]) => parseTenths(v) === undefined)?.[0] ?? null;
  // Before it arrives there is nothing to read: the meters in are asked for when it comes in.
  const notHereYet = status === "requested" || status === "scheduled";
  const showMeters = !notHereYet || !!(hobbsIn || tachIn);
  const recorded = { hobbs: plane?.hobbsTime || null, tach: plane?.tachTime || null };
  const meterHint = (value: string, filled: string | undefined, last: number | null) =>
    value && value === filled
      ? "From the aircraft's meters. Check them."
      : last != null
        ? `The aircraft last read ${tenthsLabel(last)}.`
        : undefined;

  /**
   * Readings typed in this save that look wrong: lower than the aircraft's own meters, or out
   * lower than in. Asked about, not refused: a meter replaced during the work reads lower, and
   * the desk knows that; a slipped digit is what this is for. Unchanged readings are not asked
   * about again, so editing an old job's notes never nags.
   */
  function suspiciousReadings(): string[] {
    const was = (k: "hobbsIn" | "tachIn" | "hobbsOut" | "tachOut") => (editing ? (editing[k] ?? null) : null);
    const now = { hobbsIn: parseTenths(hobbsIn) ?? null, tachIn: parseTenths(tachIn) ?? null, hobbsOut: parseTenths(hobbsOut) ?? null, tachOut: parseTenths(tachOut) ?? null };
    const out: string[] = [];
    const tail = editing ? workOrderAircraftName(editing) : "the aircraft";
    if (hasHobbs && now.hobbsIn != null && now.hobbsIn !== was("hobbsIn") && recorded.hobbs != null && now.hobbsIn < recorded.hobbs) {
      out.push(`Hobbs in ${tenthsLabel(now.hobbsIn)} is lower than the ${tenthsLabel(recorded.hobbs)} recorded for ${tail}.`);
    }
    if (hasTach && now.tachIn != null && now.tachIn !== was("tachIn") && recorded.tach != null && now.tachIn < recorded.tach) {
      out.push(`Tach in ${tenthsLabel(now.tachIn)} is lower than the ${tenthsLabel(recorded.tach)} recorded for ${tail}.`);
    }
    const outChanged = (k: "hobbsOut" | "tachOut", i: "hobbsIn" | "tachIn") => now[k] !== was(k) || now[i] !== was(i);
    if (hasHobbs && now.hobbsOut != null && now.hobbsIn != null && now.hobbsOut < now.hobbsIn && outChanged("hobbsOut", "hobbsIn")) {
      out.push(`Hobbs out ${tenthsLabel(now.hobbsOut)} is lower than Hobbs in ${tenthsLabel(now.hobbsIn)}.`);
    }
    if (hasTach && now.tachOut != null && now.tachIn != null && now.tachOut < now.tachIn && outChanged("tachOut", "tachIn")) {
      out.push(`Tach out ${tenthsLabel(now.tachOut)} is lower than tach in ${tenthsLabel(now.tachIn)}.`);
    }
    return out;
  }
  const aircraftError = !effectiveResourceId;
  const pending = create.isPending || update.isPending;

  async function submit() {
    if (aircraftError || badReading) {
      setShowErrors(true);
      return;
    }
    const doubts = showMeters ? suspiciousReadings() : [];
    if (doubts.length) {
      const ok = await confirm({
        title: "Check the meter readings",
        description: `${doubts.join(" ")} Save them anyway only if that is what the meters say, for example after a meter was replaced.`,
        confirmLabel: "Save anyway",
        cancelLabel: "Fix them",
      });
      if (!ok) return;
    }
    if (!once.begin()) return;
    const body: WorkOrderInput = {
      status,
      complaint: complaint.trim() || null,
      promisedOn: promisedOn || null,
      billToOrgUserId: billTo && billTo !== NOBODY ? Number(billTo) : null,
      technicianOrgUserIds: technicians.map(Number),
      reservationId: bookingId !== NOBODY ? Number(bookingId) : null,
      ...(hasHobbs ? { hobbsIn: parseTenths(hobbsIn) as number | null } : {}),
      ...(hasTach ? { tachIn: parseTenths(tachIn) as number | null } : {}),
    };
    try {
      if (editing) {
        const full: Record<string, unknown> = {
          ...body,
          ...(hasHobbs ? { hobbsOut: parseTenths(hobbsOut) as number | null } : {}),
          ...(hasTach ? { tachOut: parseTenths(tachOut) as number | null } : {}),
          customerNotes: customerNotes.trim() || null,
          internalNotes: internalNotes.trim() || null,
        };
        // Only what the person changed since the form opened.
        const changed = Object.fromEntries(
          Object.entries(full).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(snapshot.current[k]))
        ) as WorkOrderInput;
        if (Object.keys(changed).length) await update.mutateAsync({ id: editing.id, ...changed });
        toast.success(`${editing.label} saved`);
        onOpenChange(false);
        return;
      }
      // A bill-to nobody picked is the server's to default (the primary owner). The picker only
      // shows the same default; sending it would turn a failed owners read into "nobody".
      const created = await create.mutateAsync({
        ...body,
        resourceId: effectiveResourceId!,
        ...(billTo === "" || !billToTouched.current ? { billToOrgUserId: undefined } : {}),
      });
      toast.success(`${created.label} opened for ${workOrderAircraftName(created)}`);
      onOpenChange(false);
      void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(created.id) } });
    } catch (e) {
      once.fail();
      toast.error(e instanceof Error ? e.message : "Couldn't save the work order");
    }
  }

  const stages = editing ? WORK_ORDER_STATUS_OPTIONS : WORK_ORDER_STATUS_OPTIONS.filter((o) => OPENING_STAGES.includes(o.value));

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.label}` : "Open a work order"}
      description={
        editing
          ? `${workOrderAircraftName(editing)}${editing.billTo?.name ? `, billed to ${editing.billTo.name}` : ""}`
          : "One job on one aircraft, from the owner's call to the invoice."
      }
      dataDocShot={editing ? undefined : "open-work-order"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Open work order"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!editing && !fixedResourceId && (
          <Field label="Aircraft" htmlFor="wo-aircraft">
            <Combobox
              id="wo-aircraft"
              options={aircraftOptions}
              value={resourceId}
              onChange={(v) => {
                setResourceId(v);
                billToTouched.current = false;
                setBookingId(NOBODY);
                setHobbsIn("");
                setTachIn("");
              }}
              placeholder={planesQ.isLoading ? "Loading aircraft…" : "Pick the aircraft"}
              searchPlaceholder="Search tails…"
              invalid={showErrors && aircraftError}
              action={mayAddAircraft ? { label: "Add a customer aircraft", onSelect: (typed) => setAddingAircraft(typed) } : undefined}
            />
            {showErrors && aircraftError && <p className="text-xs text-destructive">Pick the aircraft.</p>}
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stage" htmlFor="wo-status">
            <Select value={status} onValueChange={(v) => setStatus(v as WorkOrderStatus)}>
              <SelectTrigger id="wo-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((o) => (
                  <SelectItem key={o.value} value={o.value} description={o.hint}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Promised back" htmlFor="wo-promised">
            <DatePickerField id="wo-promised" value={promisedOn} onChange={setPromisedOn} placeholder="Not promised yet" clearable />
          </Field>
        </div>

        <Field
          label="Billed to"
          htmlFor="wo-bill-to"
          hint={
            mayChooseBillTo
              ? "One person pays for the job. Co-owners are not billed. It can change until the invoice is raised."
              : "The aircraft's owner. An admin can change who pays."
          }
        >
          <Combobox
            id="wo-bill-to"
            options={billToOptions}
            value={billTo}
            onChange={(v) => {
              billToTouched.current = true;
              setBillTo(v);
            }}
            placeholder={effectiveResourceId ? "Pick who pays" : "Pick the aircraft first"}
            disabled={!effectiveResourceId || (editing?.billing ?? "none") !== "none" || !mayChooseBillTo}
          />
        </Field>

        <Field label="What the owner asked for" htmlFor="wo-complaint" hint="In their words. What the shop finds goes on the job itself.">
          <Textarea
            id="wo-complaint"
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="Annual inspection. Left brake feels soft."
            maxLength={2000}
            rows={3}
          />
        </Field>

        {(hasHobbs || hasTach) && !showMeters && (
          <p className="text-xs text-muted-foreground">
            The Hobbs and tach in are recorded when the aircraft arrives: choose Aircraft received then.
          </p>
        )}
        {(hasHobbs || hasTach) && showMeters && (
          <div className="grid gap-4 sm:grid-cols-2">
            {hasHobbs && (
              <Field label="Hobbs in" htmlFor="wo-hobbs-in" hint={meterHint(hobbsIn, autoFilled.current.hobbs, recorded.hobbs)}>
                <Input
                  id="wo-hobbs-in"
                  inputMode="decimal"
                  value={hobbsIn}
                  onChange={(e) => setHobbsIn(e.target.value)}
                  placeholder="1234.5"
                  className="tnum"
                  aria-invalid={showErrors && badReading === "hobbsIn"}
                />
              </Field>
            )}
            {hasTach && (
              <Field label="Tach in" htmlFor="wo-tach-in" hint={meterHint(tachIn, autoFilled.current.tach, recorded.tach)}>
                <Input
                  id="wo-tach-in"
                  inputMode="decimal"
                  value={tachIn}
                  onChange={(e) => setTachIn(e.target.value)}
                  placeholder="1234.5"
                  className="tnum"
                  aria-invalid={showErrors && badReading === "tachIn"}
                />
              </Field>
            )}
            {editing && hasHobbs && (
              <Field
                label="Hobbs out"
                htmlFor="wo-hobbs-out"
                hint={lowerOut(hobbsIn, hobbsOut) ? "Lower than Hobbs in. Check it, unless the meter was replaced." : undefined}
              >
                <Input placeholder="1234.5"
                  id="wo-hobbs-out"
                  inputMode="decimal"
                  value={hobbsOut}
                  onChange={(e) => setHobbsOut(e.target.value)}
                  className="tnum"
                  aria-invalid={showErrors && badReading === "hobbsOut"}
                />
              </Field>
            )}
            {editing && hasTach && (
              <Field
                label="Tach out"
                htmlFor="wo-tach-out"
                hint={lowerOut(tachIn, tachOut) ? "Lower than tach in. Check it, unless the meter was replaced." : undefined}
              >
                <Input placeholder="1234.5"
                  id="wo-tach-out"
                  inputMode="decimal"
                  value={tachOut}
                  onChange={(e) => setTachOut(e.target.value)}
                  className="tnum"
                  aria-invalid={showErrors && badReading === "tachOut"}
                />
              </Field>
            )}
          </div>
        )}
        {showErrors && badReading && (
          <p className="text-xs text-destructive">Meters are hours to one decimal place, like 1234.5.</p>
        )}

        <Field label="Technicians">
          <MultiCombobox
            options={technicianOptions}
            values={technicians}
            onChange={setTechnicians}
            placeholder="Assign technicians"
            emptyText="No technicians or admins yet."
          />
        </Field>

        {(bookingOptions.length > 0 || bookingId !== NOBODY) && (
          <Field label="Booked for" htmlFor="wo-booking" hint="The maintenance booking on the schedule that holds the aircraft and the hangar for this job.">
            <Select value={bookingId} onValueChange={setBookingId}>
              <SelectTrigger id="wo-booking" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOBODY}>Not linked</SelectItem>
                {bookingOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        {editing && (
          <>
            <Field label="Notes for the owner" htmlFor="wo-customer-notes" hint="What may be shown to the owner.">
              <Textarea placeholder="What the owner should know: parts on order, what to watch for" id="wo-customer-notes" value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} maxLength={4000} rows={3} />
            </Field>
            <Field label="Shop notes" htmlFor="wo-internal-notes" hint="For the shop only.">
              <Textarea placeholder="Purchase orders, reminders, anything the owner should not see" id="wo-internal-notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} maxLength={4000} rows={3} />
            </Field>
          </>
        )}
      </div>
      {mayAddAircraft && (
        <AircraftFormModal
          open={addingAircraft != null}
          onOpenChange={(o) => !o && setAddingAircraft(null)}
          locations={locationsQ.data ?? []}
          defaultUse="shop"
          defaultTail={addingAircraft ?? undefined}
          onCreated={(r) => {
            setResourceId(String(r.id));
            billToTouched.current = false;
            setBookingId(NOBODY);
          }}
        />
      )}
    </ResponsiveModal>
  );
}

/** The editable fields of a job in the shape the form sends, to compare against on save. */
function bodyOf(w: WorkOrder): Record<string, unknown> {
  return {
    status: w.status,
    complaint: w.complaint ?? null,
    promisedOn: w.promisedOn ?? null,
    billToOrgUserId: w.billTo?.id ?? null,
    technicianOrgUserIds: w.technicians.map((t) => t.id),
    reservationId: w.booking?.id ?? null,
    hobbsIn: w.hobbsIn ?? null,
    tachIn: w.tachIn ?? null,
    hobbsOut: w.hobbsOut ?? null,
    tachOut: w.tachOut ?? null,
    customerNotes: w.customerNotes ?? null,
    internalNotes: w.internalNotes ?? null,
  };
}
