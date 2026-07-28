import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Ban, Loader2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  useApprovedResources,
  useCreateReservation,
  useLocations,
  useMembers,
  useMyInstructionPartners,
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
  isInstructor as hasInstructorRole,
  isStudent as hasStudentRole,
  isRenter,
  isTechnician,
  reservationTypesForRoles,
  selfBookableTypes,
} from "@/lib/permissions";
import { ResponsiveModal } from "@/components/responsive-modal";
import { EmptyState, ErrorState } from "@/components/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { dateKeyInZone, zonedWallClockToUtc } from "@/lib/timezone";
import { useTimeZone } from "@/lib/use-timezone";
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

/**
 * What a member's booking is called. They never see a title field — dispatch names
 * bookings, and "N172TS — Dual" is what anyone would have typed.
 */
function autoTitle(resource: Resource | undefined, type: ReservationType): string {
  const name = resource ? resourceLabel(resource).name : "";
  return name ? `${name} — ${typeLabel(type)}` : typeLabel(type);
}

/**
 * `exclude` drops members already assigned to another side of this booking. Someone
 * holding both the instructor and student roles shows up in both rosters, so without
 * it dispatch can put one person in two seats — which the server rejects, and which
 * could never be closed out anyway: a review confirmation is keyed on the person, so
 * they sign off once while the close-out waits on two.
 */
function memberOptions(
  rows: OrganizationUser[] | undefined,
  exclude?: ReadonlySet<string>
): ComboOption[] {
  return (rows ?? [])
    .filter((ou) => !exclude?.has(String(ou.id)))
    .map((ou) => ({
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

/**
 * THE booking form. One implementation, two audiences.
 *
 * `variant: "dispatch"` — the staff board. Assigns other people: an instructor, a
 * student or a renter, each from a full picker.
 *
 * `variant: "self"` — a member booking themselves (/me/book). This is NOT a second
 * form: booking yourself is the same reservation with one personnel side already
 * filled in with you. Someone who is both an instructor and a student picks which
 * seat they're in, and the other side becomes the counterpart picker.
 *
 * They were two separate components until 2026-07-27, and they drifted in both
 * directions — dispatch had repeat/duplicate/edit/title that self lacked, self had
 * the seat toggle, renter-approved fleet, role-gated types and error focus that
 * dispatch lacked. Everything below is written once so that can't happen again;
 * every genuine difference between the two is a `isSelf` branch you can grep for.
 */
export function ReservationForm({
  open = true,
  onOpenChange,
  draft,
  onCreated,
  editing,
  duplicating,
  variant = "dispatch",
  self,
}: {
  /** Modal-only. A page-rendered self form is always "open". */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  /** Who this form is for. See the component doc. */
  variant?: "dispatch" | "self";
  /**
   * Required when `variant === "self"`: the member doing the booking. Their
   * org-user id goes onto the reservation as the personnel; their user id loads
   * the fleet they're checked out on and their instruction partners.
   */
  self?: { orgUserId: number; userId: number };
}) {
  const { roles } = useAuth();
  const tz = useTimeZone();
  const navigate = useNavigate();

  const isSelf = variant === "self";
  //A self booking renders as a page card, so there is no modal to close.
  const closeModal = React.useCallback(
    (next: boolean) => onOpenChange?.(next),
    [onOpenChange]
  );
  // GET /maintenance/squawks is staff/technician-only — it 403s for instructor,
  // student and renter. Gate on the role so a viewer who can't read squawks
  // never fires a request that is guaranteed to fail; the UI then degrades to
  // grounded-only, which needs no request at all.
  const canSeeSquawks = canViewSquawks(roles);
  // Which types are on offer. Dispatch may book anything its roles can create;
  // a member may only book types that SEAT them — the two matrices differ, and
  // the server gates creation on the same ones, so anything else would 400.
  const typeOptions = React.useMemo(
    () => (isSelf ? selfBookableTypes(roles) : reservationTypesForRoles(roles)),
    [roles, isSelf]
  );
  // Dispatch mostly books training flights, so the board keeps defaulting to
  // dual. A member gets what their own roles imply — a renter+student defaults
  // to a rental, not a solo.
  const initialType = React.useMemo<ReservationType>(() => {
    if (isSelf) {
      if (isRenter(roles) && typeOptions.includes("rental")) return "rental";
      if (isTechnician(roles) && typeOptions.length === 1) return "maintenance";
      return typeOptions.includes("solo") ? "solo" : typeOptions[0] ?? "solo";
    }
    return typeOptions.includes("dual")
      ? "dual"
      : defaultReservationType(roles) ?? typeOptions[0] ?? "dual";
  }, [roles, typeOptions, isSelf]);

  /**
   * Someone holding BOTH the instructor and student roles has to say which seat
   * they're in; anyone else is unambiguous. Only ever asked in the self variant —
   * dispatch names both people explicitly.
   */
  const meIsInstructor = hasInstructorRole(roles);
  const meIsStudent = hasStudentRole(roles);
  const seatIsAmbiguous = isSelf && meIsInstructor && meIsStudent;
  const [asInstructor, setAsInstructor] = React.useState(meIsInstructor);
  const selfIsInstructor = seatIsAmbiguous ? asInstructor : meIsInstructor;

  const resourcesQ = useResources({ enabled: open });
  // Renters may only book aircraft they are checked out on. Everyone else — and
  // every other type — draws from the full fleet, filtered by what the type needs.
  const approvedQ = useApprovedResources(self?.userId ?? 0, {
    enabled: open && isSelf && self != null,
  });
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

  /**
   * A self booking puts the member on one side of the reservation and leaves the
   * other as the counterpart. Expressing it through the SAME instructor/student/
   * renter ids the dispatch form uses is what lets both share one submit path —
   * there is no second personnel model to keep in step.
   */
  const selfOrgUserId = self ? String(self.orgUserId) : "";
  const selfSide: "instructors" | "students" | "renters" | null = !isSelf
    ? null
    : type === "rental"
      ? "renters"
      : type === "guest"
        ? meIsInstructor
          ? "instructors"
          : null // a non-instructor takes a guest up with nobody attached
        : selfIsInstructor
          ? "instructors"
          : "students";
  /**
   * The side the member picks, i.e. whichever one they are not sitting in — or null
   * when the booking has no second person at all.
   *
   * `exclusive` is the check that matters here: a SOLO allows both an instructor and
   * a student in the matrix, but at most one of them, because a solo has one pilot.
   * Offering a counterpart there would build a reservation the server rejects — and
   * would be a dual anyway.
   */
  const needsCounterpart =
    isSelf &&
    TYPE_REQUIREMENTS[type].allows.includes("instructors") &&
    TYPE_REQUIREMENTS[type].allows.includes("students") &&
    TYPE_REQUIREMENTS[type].exclusive.length === 0;
  const counterpartSide: "instructors" | "students" | null = !needsCounterpart
    ? null
    : selfIsInstructor
      ? "students"
      : "instructors";

  const effectiveInstructorId =
    selfSide === "instructors" ? selfOrgUserId : instructorId;
  const effectiveStudentId = selfSide === "students" ? selfOrgUserId : studentId;
  const effectiveRenterId = selfSide === "renters" ? selfOrgUserId : renterId;

  /**
   * The org users already spoken for on the OTHER sides of this booking, so no
   * picker can offer someone a second seat. See memberOptions for why that matters.
   *
   * Only sides the current type accepts contribute: a picker hidden by a type switch
   * can leave a stale id behind, and that must not quietly hide a real member from a
   * roster they belong in.
   */
  const assignedElsewhere = React.useCallback(
    (side: "instructors" | "students" | "renters"): ReadonlySet<string> => {
      const allows = TYPE_REQUIREMENTS[type].allows;
      const taken = new Set<string>();
      const add = (from: typeof side, id: string) => {
        if (from !== side && allows.includes(from) && id) taken.add(id);
      };
      add("instructors", effectiveInstructorId);
      add("students", effectiveStudentId);
      add("renters", effectiveRenterId);
      return taken;
    },
    [type, effectiveInstructorId, effectiveStudentId, effectiveRenterId]
  );

  // Everyone assigned must be free for the slot — feed their USER ids to the
  // smart time picker so it intersects their availability with the aircraft's.
  const personnelUserIds = React.useMemo(() => {
    const allows = TYPE_REQUIREMENTS[type].allows;
    const ids: number[] = [];
    const add = (id: number | null) => id != null && ids.push(id);
    // Only the sides this type accepts — a picker hidden by a type switch can
    // leave a stale id behind, and constraining the slot on it would hide times
    // that are actually free.
    if (allows.includes("instructors")) add(userIdOf(instructorsQ.data, effectiveInstructorId));
    if (allows.includes("students")) add(userIdOf(studentsQ.data, effectiveStudentId));
    if (allows.includes("renters")) add(userIdOf(rentersQ.data, effectiveRenterId));
    //The member themselves may not appear in the lists above (a renter booking a
    //rental isn't in the instructor or student roster), so add them directly —
    //their own availability still gates the slot.
    if (isSelf && self && type !== "maintenance" && !ids.includes(self.userId)) {
      ids.push(self.userId);
    }
    return ids;
  }, [
    effectiveInstructorId,
    effectiveStudentId,
    effectiveRenterId,
    type,
    instructorsQ.data,
    studentsQ.data,
    rentersQ.data,
    isSelf,
    self,
  ]);

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
        //The day this booking is on is the airport's day, not the viewer's — a 9pm Mountain
        //flight is already tomorrow in UTC.
        setDate(Number.isNaN(start.getTime()) ? "" : dateKeyInZone(start, tz.zone));
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
            : dateKeyInZone(source, tz.zone)
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
        //A draft's "HH:mm" comes from clicking the grid, which is ruled in AIRPORT time —
        //so it has to be interpreted there too. `new Date("2026-07-28T09:00")` parses in the
        //browser's zone, which booked the flight at the wrong instant for any dispatcher
        //working from somewhere other than the field. Nothing surfaced the mistake: the
        //request succeeded and the block drew where they clicked.
        const seed = (hhmm?: string): Date | null => {
          if (!hhmm) return null;
          const [h, m] = hhmm.split(":").map(Number);
          if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
          const [yy, mm, dd] = format(draft.date, "yyyy-MM-dd").split("-").map(Number);
          return zonedWallClockToUtc(yy, mm, dd, h, m, tz.zone);
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

  // Who the member is actually paired with for instruction. The server lets a
  // student book ANY instructor, so this SORTS rather than filters — your own come
  // first, everyone else stays reachable below them.
  const partners = useMyInstructionPartners(self?.userId ?? 0, {
    enabled: open && isSelf && self != null && counterpartSide != null,
  });
  const myPartnerOrgUserIds = React.useMemo(() => {
    const list = selfIsInstructor ? partners.data?.students : partners.data?.instructors;
    return new Set(
      (list ?? []).map((p) => p.orgUser?.id).filter((id): id is number => id != null)
    );
  }, [partners.data, selfIsInstructor]);

  const partnerSortedOptions = React.useCallback(
    (rows: OrganizationUser[] | undefined): ComboOption[] =>
      (rows ?? [])
        // Never offer yourself as your own counterpart.
        .filter((ou) => !isSelf || ou.id !== self?.orgUserId)
        .map((ou) => ({
          value: String(ou.id),
          label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
          hint: myPartnerOrgUserIds.has(ou.id)
            ? selfIsInstructor
              ? "Your student"
              : "Your instructor"
            : (ou.identifier ?? undefined),
          mine: myPartnerOrgUserIds.has(ou.id),
        }))
        .sort((a, b) => Number(b.mine) - Number(a.mine) || a.label.localeCompare(b.label))
        .map(({ mine: _mine, ...opt }) => opt),
    [isSelf, self, myPartnerOrgUserIds, selfIsInstructor]
  );

  // Each type books a specific kind of resource — a ground session needs a room,
  // a sim session a simulator, everything else an aircraft. Offering the whole
  // fleet regardless of type just invites a 400.
  const eligibleResources = React.useMemo(() => {
    //A renter booking a rental sees only the aircraft they are checked out on;
    //everything else draws from the whole fleet, narrowed to what the type needs.
    const pool =
      isSelf && type === "rental" ? approvedQ.data ?? [] : resourcesQ.data ?? [];
    return pool.filter((r) => resourceMatchesType(r, type));
  }, [resourcesQ.data, approvedQ.data, type, isSelf]);

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

    //A member never sees a title field — naming the booking is dispatch's job, and
    //"N172TS — Dual" is what they would have typed anyway.
    const effectiveTitle = isSelf ? autoTitle(selectedResource, type) : title.trim();
    if (!effectiveTitle) return setError("Give the reservation a title.");
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
      if (effectiveInstructorId) personnel.instructors = [{ id: Number(effectiveInstructorId) }];
    } else {
      // Only compose the sides this type actually allows — a stale instructor
      // left selected from a previous type would otherwise be sent along and
      // rejected (a maintenance booking must carry nobody at all).
      const req = TYPE_REQUIREMENTS[type];
      if (effectiveInstructorId && req.allows.includes("instructors"))
        personnel.instructors = [{ id: Number(effectiveInstructorId) }];
      if (effectiveStudentId && req.allows.includes("students"))
        personnel.students = [{ id: Number(effectiveStudentId) }];
      if (effectiveRenterId && req.allows.includes("renters"))
        personnel.renters = [{ id: Number(effectiveRenterId) }];

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
      title: effectiveTitle,
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
        closeModal(false);
        return;
      }
      const created = await create.mutateAsync(input);
      toast.success(
        input.recurrence ? "Repeating booking created" : "Reservation booked"
      );
      if (isSelf) {
        //A member books from a page, not a modal — send them to their schedule so
        //they can see what they just booked.
        await navigate({ to: "/me/schedule" });
        return;
      }
      closeModal(false);
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

  // The fleet has to load before the member can pick anything, and a page can show
  // that honestly where a modal can't. Dispatch keeps its inline "Loading…"
  // placeholder in the picker.
  const fleetQ = isSelf && type === "rental" ? approvedQ : resourcesQ;
  if (isSelf && fleetQ.isPending) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }
  if (isSelf && fleetQ.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={fleetQ.error} onRetry={() => void fleetQ.refetch()} />
        </CardContent>
      </Card>
    );
  }
  if (isSelf && eligibleResources.length === 0 && TYPE_REQUIREMENTS[type].resourceRequired) {
    const kindName = TYPE_REQUIREMENTS[type].resource;
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={Ban}
            title={
              type === "rental"
                ? "You're not checked out on any aircraft"
                : `No ${kindName.toLowerCase()}s to book`
            }
            body={
              type === "rental"
                ? "Ask your school to approve you on the fleet you can fly."
                : `Your school hasn't set up any ${kindName.toLowerCase()}s yet.`
            }
          />
        </CardContent>
      </Card>
    );
  }

  const body = (
      <form onSubmit={submit} className="space-y-4">
        {/* Dispatch names its bookings; a member's is generated from the aircraft
            and the type — see autoTitle. */}
        {!isSelf && (
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
        )}

        <div className="grid gap-3 sm:grid-cols-2">
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

        {/* Which seat the member is in, when they hold both roles. Dispatch never
            asks — it names both people outright. */}
        {seatIsAmbiguous && counterpartSide && (
          <div className="space-y-1.5">
            <Label>Your seat</Label>
            <div
              role="radiogroup"
              aria-label="Your seat on this booking"
              className="flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
            >
              {[
                { instructing: true, label: "I'm instructing" },
                { instructing: false, label: "I'm the student" },
              ].map((opt) => (
                <Button
                  key={String(opt.instructing)}
                  type="button"
                  role="radio"
                  aria-checked={asInstructor === opt.instructing}
                  variant={asInstructor === opt.instructing ? "default" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setAsInstructor(opt.instructing);
                    //The counterpart is on the other side now, so the old pick is
                    //meaningless.
                    setInstructorId("");
                    setStudentId("");
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        )}

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
              {/* A member taking a guest up IS the instructor — there is nobody to
                  assign. Dispatch picks who flies them. */}
              {!isSelf && (
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
              )}
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
            {/* A member is already on one side of this booking, so they pick only
                the other. Dispatch names both. */}
            {isSelf ? (
              counterpartSide && (
                <div className="space-y-1.5">
                  <Label>
                    {counterpartSide === "instructors" ? "Instructor" : "Student"}
                    {!TYPE_REQUIREMENTS[type].requiresAll.includes(counterpartSide) &&
                      " (optional)"}
                  </Label>
                  <Combobox
                    id="res-counterpart"
                    options={
                      counterpartSide === "instructors"
                        ? partnerSortedOptions(instructorsQ.data)
                        : partnerSortedOptions(studentsQ.data)
                    }
                    value={counterpartSide === "instructors" ? instructorId : studentId}
                    onChange={
                      counterpartSide === "instructors" ? setInstructorId : setStudentId
                    }
                    placeholder={
                      counterpartSide === "instructors"
                        ? "Select an instructor…"
                        : "Select a student…"
                    }
                    searchPlaceholder="Search…"
                    emptyText="Nobody found."
                  />
                </div>
              )
            ) : null}

            {/* Only the sides this type accepts — a rental has no instructor, a
                dual has no renter. Mirrors the server's type matrix. */}
            {!isSelf && TYPE_REQUIREMENTS[type].allows.includes("instructors") && (
              <div className="space-y-1.5">
                <Label>Instructor</Label>
                <Combobox
                  options={memberOptions(instructorsQ.data, assignedElsewhere("instructors"))}
                  value={instructorId}
                  onChange={setInstructorId}
                  placeholder="Assign instructor"
                  searchPlaceholder="Search instructors…"
                  emptyText="No instructors."
                />
              </div>
            )}
            {!isSelf && TYPE_REQUIREMENTS[type].allows.includes("students") && (
              <div className="space-y-1.5">
                <Label>Student</Label>
                <Combobox
                  options={memberOptions(studentsQ.data, assignedElsewhere("students"))}
                  value={studentId}
                  onChange={setStudentId}
                  placeholder="Assign student"
                  searchPlaceholder="Search students…"
                  emptyText="No students."
                />
              </div>
            )}
            {!isSelf && TYPE_REQUIREMENTS[type].allows.includes("renters") && (
              <div className="space-y-1.5">
                <Label>Renter</Label>
                <Combobox
                  options={memberOptions(rentersQ.data, assignedElsewhere("renters"))}
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
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              isSelf ? void navigate({ to: "/me/schedule" }) : closeModal(false)
            }
          >
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
  );

  //Wider than the default dialog: this form carries two person pickers, a smart time
  //range and the repeat control, and the narrower column was making rows of controls
  //overflow rather than wrap. A member books from a page, so it gets a card instead.
  if (isSelf) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Book a reservation</CardTitle>
        </CardHeader>
        <CardContent>{body}</CardContent>
      </Card>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={closeModal}
      className="sm:max-w-2xl"
      title={isEditing ? "Edit reservation" : "New reservation"}
      description={
        isEditing
          ? "Change the aircraft, crew or times for this reservation."
          : "Book aircraft, instructors and students onto the dispatch board."
      }
    >
      {body}
    </ResponsiveModal>
  );
}
