import * as React from "react";
import { format } from "date-fns";
import { Ban, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateReservation,
  useLocations,
  useMembers,
  useRatings,
  useResources,
  useSquawks,
  useUpdateReservation,
} from "@/features/queries";
import {
  resourceLabel,
  type CreateReservationInput,
  type OrganizationUser,
  type Reservation,
  type ReservationType,
  type Resource,
  type Squawk,
} from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  canViewSquawks,
  defaultReservationType,
  reservationTypesForRoles,
} from "@/lib/permissions";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DOT_CLASS, typeLabel } from "./meta";
import { SmartTimeRange } from "./smart-time-range";
import {
  RecurrenceField,
  defaultRecurrence,
  toRecurrenceInput,
  type RecurrenceState,
} from "./recurrence-field";

import {
  DEVICE_TZ,
  TYPE_REQUIREMENTS,
  buildReservationInput,
  resolveLocationId,
  resourceMatchesType,
  validatePersonnelForType,
  validateTimeRange,
} from "./reservation-shared";

/** Resolve a member combobox value (org-user id) to that person's USER id. */
function userIdOf(list: OrganizationUser[] | undefined, orgUserId: string): number | null {
  if (!orgUserId) return null;
  return list?.find((m) => String(m.id) === orgUserId)?.user?.id ?? null;
}


export type ReservationDraft = {
  date: Date;
  resourceId?: number;
  start?: string; // "HH:mm"
  end?: string; // "HH:mm"
};

function memberOptions(rows: OrganizationUser[] | undefined): ComboOption[] {
  return (rows ?? []).map((ou) => ({
    value: String(ou.id),
    label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
    hint: ou.identifier ?? undefined,
  }));
}

// ── Airworthiness ───────────────────────────────────────────────────────────
// Read-only surfacing. Nothing here blocks a booking: the server is the
// authority on whether a grounded aircraft may be dispatched, and dispatch
// legitimately books grounded aircraft (maintenance, ferry-to-shop).
// The member self-serve form (components/book/booking-form.tsx) reuses the three
// exports below so both pickers say the same thing the same way.

/** Grounding for a resource, read off the record the picker already loaded —
 *  planes and simulators both carry `grounded` / `groundedReason`; rooms don't. */
function groundedOf(r: Resource | undefined): { grounded: boolean; reason: string | null } {
  const unit = r?.type?.plane ?? r?.type?.simulator ?? null;
  if (!unit) return { grounded: false, reason: null };
  return { grounded: unit.grounded, reason: unit.groundedReason ?? null };
}

function squawkCountLabel(n: number): string {
  return `${n} open squawk${n === 1 ? "" : "s"}`;
}

/**
 * Bucket the org's open squawks by resource id, once, so a picker can read a
 * per-option count without a request per row. The API strips every FK_* field,
 * so the resource id only exists on the nested relation — `s.FK_resourceId` is
 * always null.
 */
export function groupSquawksByResource(squawks: Squawk[] | undefined): Map<number, Squawk[]> {
  const map = new Map<number, Squawk[]>();
  for (const s of squawks ?? []) {
    const id = s.resource?.id;
    if (id == null) continue;
    const list = map.get(id);
    if (list) list.push(s);
    else map.set(id, [s]);
  }
  return map;
}

/**
 * The airworthiness text for a picker option's `hint`, or "" when the resource is
 * clean. The Combobox row renders plain `label` + `hint` strings, so this is where
 * the per-option signal lives; it also joins the search text, so typing "grounded"
 * filters the fleet down to what's out of service.
 */
export function airworthinessHint(r: Resource, openSquawks: number): string {
  const flags: string[] = [];
  if (groundedOf(r).grounded) flags.push("Grounded");
  if (openSquawks > 0) flags.push(squawkCountLabel(openSquawks));
  return flags.join(" · ");
}

/**
 * Airworthiness notice for the selected resource: the grounding reason, then the
 * open squawks. Purely factual — it reports the aircraft's state and never
 * infers anything about why you're booking it.
 */
export function AirworthinessNotice({
  resource,
  squawks,
}: {
  resource: Resource | undefined;
  squawks: Squawk[];
}) {
  const { grounded, reason } = groundedOf(resource);
  if (!resource || (!grounded && squawks.length === 0)) return null;

  const alarm = grounded;
  const Icon = alarm ? Ban : Wrench;
  const name = resourceLabel(resource).name;

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border p-3 text-sm",
        alarm
          ? "border-[color-mix(in_oklch,var(--destructive)_30%,transparent)] bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
          : "border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_10%,transparent)]"
      )}
      role="status"
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          alarm
            ? "text-destructive"
            : "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]"
        )}
      />
      <div className="min-w-0 space-y-1.5">
        {grounded && (
          <p className={alarm ? "text-destructive" : "text-foreground"}>
            <span className="font-medium">{name} is grounded:</span>{" "}
            {reason?.trim() ? reason : "no reason was given."}
          </p>
        )}
        {squawks.length > 0 && (
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">{squawkCountLabel(squawks.length)}</p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {squawks.slice(0, 4).map((s) => (
                <li key={s.id} className="truncate">
                  {s.title || "Untitled squawk"}
                  {s.grounding ? " (grounding)" : ""}
                </li>
              ))}
              {squawks.length > 4 && <li>+{squawks.length - 4} more</li>}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** Modal form that creates a reservation — or edits one when `editing` is set. */
export function ReservationForm({
  open,
  onOpenChange,
  draft,
  onCreated,
  editing,
  duplicating,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ReservationDraft;
  /** Called with the created reservation after a successful booking (e.g. to
   * navigate to it). The board doesn't pass this; the global "+" does. */
  onCreated?: (reservation: Reservation) => void;
  /**
   * When present the form edits this reservation instead of creating one. Once
   * the aircraft is off the ramp only the end time stays editable — see
   * `canOnlyEditEndTime`.
   */
  editing?: Reservation;
  /**
   * "Book another like this." Seeds every field from an existing reservation but
   * still CREATES — `isEditing` stays false, so submit takes the create branch.
   *
   * The one thing deliberately not copied is the time: a duplicate seeded onto its
   * source's own slot would collide with it every single time, so the picker opens
   * empty and the dispatcher chooses when. The date defaults to the source's date,
   * which is usually the right week to be looking at.
   */
  duplicating?: Reservation;
}) {
  const { roles } = useAuth();
  // GET /maintenance/squawks is staff/technician-only — it 403s for instructor,
  // student and renter. Gate on the role so a viewer who can't read squawks
  // never fires a request that is guaranteed to fail; the UI then degrades to
  // grounded-only, which needs no request at all.
  const canSeeSquawks = canViewSquawks(roles);
  // Only offer types this dispatcher's roles can actually create — the server
  // gates creation on the same matrix, so anything else would 400.
  const typeOptions = React.useMemo(() => reservationTypesForRoles(roles), [roles]);
  // Dispatch mostly books training flights, so the board keeps defaulting to
  // dual; anyone whose roles can't create one falls back to their own default.
  const initialType = React.useMemo<ReservationType>(
    () =>
      typeOptions.includes("dual")
        ? "dual"
        : defaultReservationType(roles) ?? typeOptions[0] ?? "dual",
    [roles, typeOptions]
  );

  const resourcesQ = useResources({ enabled: open });
  // ONE request per form open for the whole fleet, grouped by resource below —
  // never one per option row.
  const squawksQ = useSquawks({ resolved: false }, { enabled: open && canSeeSquawks });
  const instructorsQ = useMembers({ instructor: true }, { enabled: open });
  const studentsQ = useMembers({ student: true }, { enabled: open });
  const rentersQ = useMembers({ renter: true }, { enabled: open });
  const ratingsQ = useRatings({ enabled: open });
  const locationsQ = useLocations({ enabled: open });
  const create = useCreateReservation();
  const update = useUpdateReservation();

  const isEditing = editing != null;

  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<ReservationType>(initialType);
  const [resourceId, setResourceId] = React.useState("");
  const [date, setDate] = React.useState("");
  const [startAt, setStartAt] = React.useState<Date | null>(null);
  const [endAt, setEndAt] = React.useState<Date | null>(null);
  const [instructorId, setInstructorId] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const [renterId, setRenterId] = React.useState("");
  const [ratingId, setRatingId] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [guestEmail, setGuestEmail] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  //Repeat rule. Only ever sent on CREATE — editing one occurrence of a series is
  //an ordinary edit, and changing the rule itself isn't offered yet.
  const [recurrence, setRecurrence] = React.useState<RecurrenceState>(() =>
    defaultRecurrence(null, "")
  );

  const isGuest = type === "guest";

  // Everyone assigned must be free for the slot — feed their USER ids to the
  // smart time picker so it intersects their availability with the aircraft's.
  const personnelUserIds = React.useMemo(() => {
    const allows = TYPE_REQUIREMENTS[type].allows;
    const ids: number[] = [];
    const add = (id: number | null) => id != null && ids.push(id);
    // Only the sides this type accepts — a picker hidden by a type switch can
    // leave a stale id behind, and constraining the slot on it would hide times
    // that are actually free.
    if (allows.includes("instructors")) add(userIdOf(instructorsQ.data, instructorId));
    if (allows.includes("students")) add(userIdOf(studentsQ.data, studentId));
    if (allows.includes("renters")) add(userIdOf(rentersQ.data, renterId));
    return ids;
  }, [instructorId, studentId, renterId, type, instructorsQ.data, studentsQ.data, rentersQ.data]);

  // Re-seed the form each time it opens (from the draft the board handed us).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setError(null);

      if (editing) {
        // Re-open the reservation exactly as it stands; the server revalidates
        // the whole shape on PATCH, so every field has to round-trip.
        const start = new Date(editing.start);
        const end = new Date(editing.end);
        const p = editing.personnel;
        const guest = p?.guests?.[0];
        setTitle(editing.title ?? "");
        setType(editing.type);
        setResourceId(editing.resource?.id != null ? String(editing.resource.id) : "");
        setDate(Number.isNaN(start.getTime()) ? "" : format(start, "yyyy-MM-dd"));
        setStartAt(Number.isNaN(start.getTime()) ? null : start);
        setEndAt(Number.isNaN(end.getTime()) ? null : end);
        setInstructorId(p?.instructors?.[0]?.id != null ? String(p.instructors[0].id) : "");
        setStudentId(p?.students?.[0]?.id != null ? String(p.students[0].id) : "");
        setRenterId(p?.renters?.[0]?.id != null ? String(p.renters[0].id) : "");
        setRatingId("");
        setGuestName(guest?.name ?? "");
        setGuestEmail(guest?.email ?? "");
        setGuestPhone(guest?.phone ?? "");
        setNotes(editing.notes ?? "");
      } else if (duplicating) {
        // Same crew, same aircraft, same kind of flight — new time.
        const source = new Date(duplicating.start);
        const p = duplicating.personnel;
        const guest = p?.guests?.[0];
        setTitle(duplicating.title ?? "");
        setType(duplicating.type);
        setResourceId(duplicating.resource?.id != null ? String(duplicating.resource.id) : "");
        setDate(
          Number.isNaN(source.getTime())
            ? format(draft.date, "yyyy-MM-dd")
            : format(source, "yyyy-MM-dd")
        );
        // Left for the dispatcher to pick — see the `duplicating` prop note.
        setStartAt(null);
        setEndAt(null);
        setInstructorId(p?.instructors?.[0]?.id != null ? String(p.instructors[0].id) : "");
        setStudentId(p?.students?.[0]?.id != null ? String(p.students[0].id) : "");
        setRenterId(p?.renters?.[0]?.id != null ? String(p.renters[0].id) : "");
        setRatingId("");
        setGuestName(guest?.name ?? "");
        setGuestEmail(guest?.email ?? "");
        setGuestPhone(guest?.phone ?? "");
        setNotes(duplicating.notes ?? "");
      } else {
        const seed = (hhmm?: string): Date | null => {
          if (!hhmm) return null;
          const d = new Date(`${format(draft.date, "yyyy-MM-dd")}T${hhmm}:00`);
          return Number.isNaN(d.getTime()) ? null : d;
        };
        setTitle("");
        setType(initialType);
        setResourceId(draft.resourceId != null ? String(draft.resourceId) : "");
        setDate(format(draft.date, "yyyy-MM-dd"));
        setStartAt(seed(draft.start));
        setEndAt(seed(draft.end));
        setInstructorId("");
        setStudentId("");
        setRenterId("");
        setRatingId("");
        setGuestName("");
        setGuestEmail("");
        setGuestPhone("");
        setNotes("");
      }
      //A repeat rule must never survive from one booking to the next.
      setRecurrence(defaultRecurrence(null, format(draft.date, "yyyy-MM-dd")));
    }
    wasOpen.current = open;
  }, [open, draft, initialType, editing, duplicating]);

  const openSquawksByResourceId = React.useMemo(
    () => groupSquawksByResource(squawksQ.data),
    [squawksQ.data]
  );

  // Each type books a specific kind of resource — a ground session needs a room,
  // a sim session a simulator, everything else an aircraft. Offering the whole
  // fleet regardless of type just invites a 400.
  const eligibleResources = React.useMemo(
    () => (resourcesQ.data ?? []).filter((r) => resourceMatchesType(r, type)),
    [resourcesQ.data, type]
  );

  const resourceOptions: ComboOption[] = eligibleResources.map((r) => {
    const l = resourceLabel(r);
    // Airworthiness takes the hint slot when there's something to say — it's a
    // narrow, right-aligned, truncating column and "Grounded" earns that space
    // more than "Aircraft" does.
    const air = airworthinessHint(r, openSquawksByResourceId.get(r.id)?.length ?? 0);
    return { value: String(r.id), label: l.name, hint: air || l.kind };
  });

  const selectedResource = eligibleResources.find((r) => String(r.id) === resourceId);

  // Switching type can strand a resource of the wrong kind in the picker's value.
  React.useEffect(() => {
    if (resourceId && !eligibleResources.some((r) => String(r.id) === resourceId)) {
      setResourceId("");
    }
  }, [resourceId, eligibleResources]);
  const selectedSquawks = selectedResource
    ? openSquawksByResourceId.get(selectedResource.id) ?? []
    : [];

  const ratingOptions: ComboOption[] = (ratingsQ.data ?? []).map((r) => ({
    value: String(r.id),
    label: r.name,
  }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Give the reservation a title.");
    if (!date) return setError("Pick a date.");
    const timeError = validateTimeRange(startAt, endAt);
    if (timeError) return setError(timeError);

    const locationId = resolveLocationId(selectedResource, locationsQ.data);

    const personnel: NonNullable<CreateReservationInput["personnel"]> = {};
    if (isGuest) {
      // Guest flights bill an outside pilot: needs guest name + email + a plane, optional instructor.
      if (!guestName.trim()) return setError("Enter the guest's name.");
      if (!/.+@.+\..+/.test(guestEmail.trim()))
        return setError("Enter a valid email — the guest's invoice is sent there.");
      if (!resourceId) return setError("Guest flights need an aircraft.");
      personnel.guests = [
        {
          name: guestName.trim(),
          email: guestEmail.trim(),
          ...(guestPhone.trim() ? { phone: guestPhone.trim() } : {}),
        },
      ];
      if (instructorId) personnel.instructors = [{ id: Number(instructorId) }];
    } else {
      // Only compose the sides this type actually allows — a stale instructor
      // left selected from a previous type would otherwise be sent along and
      // rejected (a maintenance booking must carry nobody at all).
      const req = TYPE_REQUIREMENTS[type];
      if (instructorId && req.allows.includes("instructors"))
        personnel.instructors = [{ id: Number(instructorId) }];
      if (studentId && req.allows.includes("students"))
        personnel.students = [{ id: Number(studentId) }];
      if (renterId && req.allows.includes("renters"))
        personnel.renters = [{ id: Number(renterId) }];

      // The server enforces per-type personnel + resource rules; validate here so
      // the happy path doesn't 400 with an opaque "Reservation type is not valid".
      const personnelError = validatePersonnelForType(type, personnel);
      if (personnelError) return setError(personnelError);
      if (req.resourceRequired && !selectedResource) {
        return setError(
          `${typeLabel(type)} reservations need ${
            req.resource === "Aircraft" ? "an aircraft" : `a ${req.resource.toLowerCase()}`
          }.`
        );
      }
    }

    const input = buildReservationInput({
      title: title.trim(),
      type,
      startAt: startAt!,
      endAt: endAt!,
      resourceId: resourceId ? Number(resourceId) : null,
      locationId,
      ratingId: ratingId ? Number(ratingId) : null,
      personnel,
      notes,
    });

    //Repeating booking. Editing never carries a rule: changing one occurrence is an
    //ordinary edit, and the server ignores `recurrence` on PATCH anyway.
    if (!editing) {
      const { input: rule, problem } = toRecurrenceInput(recurrence, startAt, endAt, DEVICE_TZ);
      if (problem) {
        setError(problem);
        toast.error(problem);
        return;
      }
      if (rule) input.recurrence = rule;
    }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input });
        toast.success("Reservation updated");
        onOpenChange(false);
        return;
      }
      const created = await create.mutateAsync(input);
      toast.success(
        input.recurrence
          ? "Repeating booking created"
          : "Reservation booked"
      );
      onOpenChange(false);
      onCreated?.(created);
    } catch (err) {
      const fallback = editing
        ? "Couldn't update the reservation"
        : "Couldn't book the reservation";
      const msg = err instanceof ApiError ? err.message : fallback;
      setError(msg);
      toast.error(msg);
    }
  }

  //Wider than the default dialog: this form carries two person pickers, a smart time
  //range and the repeat control, and the narrower column was making rows of controls
  //overflow rather than wrap.
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="sm:max-w-2xl"
      title={isEditing ? "Edit reservation" : "New reservation"}
      description={
        isEditing
          ? "Change the aircraft, crew or times for this reservation."
          : "Book aircraft, instructors and students onto the dispatch board."
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="res-title">Title</Label>
          <Input
            id="res-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Pattern work — N12345"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="res-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReservationType)}>
              <SelectTrigger id="res-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", DOT_CLASS[t])} aria-hidden />
                      {typeLabel(t)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{TYPE_REQUIREMENTS[type].resource === "Aircraft" ? "Aircraft" : TYPE_REQUIREMENTS[type].resource}</Label>
            <Combobox
              options={resourceOptions}
              value={resourceId}
              onChange={setResourceId}
              placeholder={resourcesQ.isLoading ? "Loading…" : "Select resource"}
              searchPlaceholder="Search fleet…"
              emptyText={`No ${TYPE_REQUIREMENTS[type].resource.toLowerCase()}s set up.`}
            />
          </div>
        </div>

        {/* Full-width under the picker so a long grounding reason has room.
            Skipped for maintenance: whoever is booking the work already knows
            the aircraft's state, and the notice can't know what they're
            actually there to fix. */}
        {type !== "maintenance" && (
          <AirworthinessNotice resource={selectedResource} squawks={selectedSquawks} />
        )}

        <SmartTimeRange
          date={date}
          onDateChange={setDate}
          start={startAt}
          end={endAt}
          onChange={(s, e) => {
            setStartAt(s);
            setEndAt(e);
          }}
          resourceId={resourceId ? Number(resourceId) : null}
          personnelUserIds={personnelUserIds}
          restoreWindow={
            // The reservation we're editing occupies its own slot; without this
            // the picker would report its current time as unavailable.
            editing ? { start: new Date(editing.start), end: new Date(editing.end) } : null
          }
        />

        {isGuest ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="guest-name">Guest name</Label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Jane Aviator"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-email">Guest email</Label>
                <Input
                  id="guest-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="jane@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-phone">Guest phone (optional)</Label>
                <Input
                  id="guest-phone"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  placeholder="(555) 555-5555"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Instructor (optional)</Label>
                <Combobox
                  options={memberOptions(instructorsQ.data)}
                  value={instructorId}
                  onChange={setInstructorId}
                  placeholder="Assign instructor"
                  searchPlaceholder="Search instructors…"
                  emptyText="No instructors."
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              The guest is emailed an invoice after the flight is closed out — no account needed.
            </p>
          </div>
        ) : type === "maintenance" ? (
          // Maintenance takes the aircraft off the line — the server rejects it
          // outright if anyone is assigned, so there's nobody to pick.
          <p className="text-sm text-muted-foreground">
            Maintenance blocks the aircraft for the whole window. Nobody is assigned to it — note
            what&rsquo;s being done below.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Only the sides this type accepts — a rental has no instructor, a
                dual has no renter. Mirrors the server's type matrix. */}
            {TYPE_REQUIREMENTS[type].allows.includes("instructors") && (
              <div className="space-y-1.5">
                <Label>Instructor</Label>
                <Combobox
                  options={memberOptions(instructorsQ.data)}
                  value={instructorId}
                  onChange={setInstructorId}
                  placeholder="Assign instructor"
                  searchPlaceholder="Search instructors…"
                  emptyText="No instructors."
                />
              </div>
            )}
            {TYPE_REQUIREMENTS[type].allows.includes("students") && (
              <div className="space-y-1.5">
                <Label>Student</Label>
                <Combobox
                  options={memberOptions(studentsQ.data)}
                  value={studentId}
                  onChange={setStudentId}
                  placeholder="Assign student"
                  searchPlaceholder="Search students…"
                  emptyText="No students."
                />
              </div>
            )}
            {TYPE_REQUIREMENTS[type].allows.includes("renters") && (
              <div className="space-y-1.5">
                <Label>Renter</Label>
                <Combobox
                  options={memberOptions(rentersQ.data)}
                  value={renterId}
                  onChange={setRenterId}
                  placeholder="Assign renter"
                  searchPlaceholder="Search renters…"
                  emptyText="No renters."
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Rating (optional)</Label>
              <Combobox
                options={ratingOptions}
                value={ratingId}
                onChange={setRatingId}
                placeholder="Select rating"
                searchPlaceholder="Search ratings…"
                emptyText="No ratings."
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {/* Repeating bookings are a create-time choice; editing one occurrence of a
              series is just an ordinary edit. */}
          {!isEditing && (
            <RecurrenceField
              value={recurrence}
              onChange={setRecurrence}
              start={startAt}
              disabled={create.isPending}
            />
          )}

          <Label htmlFor="res-notes">Notes</Label>
          <Textarea
            id="res-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything dispatch should know…"
            rows={3}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending || update.isPending}>
            {isEditing
              ? update.isPending
                ? "Saving…"
                : "Save changes"
              : create.isPending
                ? "Booking…"
                : "Book reservation"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
