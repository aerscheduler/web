import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { Ban, Loader2, Plus, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import {
  useBilling,
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
  isStaff,
  isTechnician,
  reservationTypesForRoles,
  selfBookableTypes,
} from "@/lib/permissions";
import { NextLessonHint } from "@/components/training/next-lesson-hint";
import { ResponsiveModal } from "@/components/responsive-modal";
import { EmptyState, ErrorState } from "@/components/states";
import { DocsHint } from "@/components/docs-hint";
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
import { OvernightMinimumNotice } from "./overnight-notice";
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
  maxForSide,
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
  /**
   * The type the click implied — a room lane means a ground lesson, a simulator lane a sim
   * session. Only honoured when the caller may actually create it; otherwise the role's own
   * default stands. See `typeForResource`.
   */
  type?: ReservationType;
};

/**
 * What a member's booking is called. They never see a title field — dispatch names
 * bookings, and "N172TS · Dual" is what anyone would have typed.
 */
function autoTitle(resource: Resource | undefined, type: ReservationType): string {
  const name = resource ? resourceLabel(resource).name : "";
  // "·" rather than an em dash: this string is STORED as the booking's title and read by
  // every member, and the app already uses the middot as its separator elsewhere.
  return name ? `${name} · ${typeLabel(type)}` : typeLabel(type);
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

/**
 * One personnel side, which may hold several people.
 *
 * The FIRST person is the side's own single-select; anyone beyond them is added below it.
 * That is a modelling choice, not a UI shortcut — the leading payer is meaningful. They
 * are the one billed when the organization's rule for a charge is "one person pays", and
 * they take the leftover cent of an uneven division, so the server's payer ordering
 * depends on knowing who is first. A flat list would throw that away.
 *
 * Two exclusion sets, and they answer different questions. `assignedElsewhere` keeps
 * somebody already seated on ANOTHER side out (one person can't be both the instructor
 * and a student — the server rejects it, and it could never be closed out because a
 * review confirmation is keyed on the person). `takenOnSide` keeps this side's own
 * pickers from offering the same person twice.
 */
function PeopleOnSide({
  label,
  pluralLabel,
  side,
  type,
  roster,
  primaryId,
  setPrimaryId,
  extraIds,
  setExtraIds,
  assignedElsewhere,
  takenOnSide,
  searchPlaceholder,
  emptyText,
}: {
  label: string;
  pluralLabel: string;
  side: "students" | "renters";
  type: ReservationType;
  roster: OrganizationUser[] | undefined;
  primaryId: string;
  setPrimaryId: (v: string) => void;
  extraIds: string[];
  setExtraIds: React.Dispatch<React.SetStateAction<string[]>>;
  assignedElsewhere: ReadonlySet<string>;
  takenOnSide: (side: "students" | "renters", exceptIndex?: number) => ReadonlySet<string>;
  searchPlaceholder: string;
  emptyText: string;
}) {
  const max = maxForSide(type, side);
  const chosen = (primaryId ? 1 : 0) + extraIds.filter(Boolean).length;
  const canAddMore = max > 1 && chosen < max && !!primaryId;

  /** Everyone this picker must not offer: the other sides, plus this side's own picks. */
  const excludeFor = (exceptIndex?: number) =>
    new Set<string>([...assignedElsewhere, ...takenOnSide(side, exceptIndex)]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{max > 1 && chosen > 1 ? pluralLabel : label}</Label>
        {max > 1 && chosen > 1 && (
          <span className="text-xs text-muted-foreground">
            {chosen} of up to {max}
          </span>
        )}
      </div>

      <Combobox
        options={memberOptions(roster, excludeFor(-1))}
        value={primaryId}
        onChange={(v) => {
          setPrimaryId(v);
          //Clearing the leading person while others remain would leave the booking with a
          //gap where its first payer should be, so promote the next one up.
          if (!v && extraIds.filter(Boolean).length) {
            const [next, ...rest] = extraIds.filter(Boolean);
            setPrimaryId(next);
            setExtraIds(rest);
          }
        }}
        placeholder={`Assign ${label.toLowerCase()}`}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
      />

      {extraIds.map((id, i) => (
        <div key={`${side}-extra-${i}`} className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Combobox
              options={memberOptions(roster, excludeFor(i))}
              value={id}
              onChange={(v) => setExtraIds((prev) => prev.map((x, j) => (j === i ? v : x)))}
              placeholder={`Add another ${label.toLowerCase()}`}
              searchPlaceholder={searchPlaceholder}
              emptyText={emptyText}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove this ${label.toLowerCase()}`}
            onClick={() => setExtraIds((prev) => prev.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}

      {canAddMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setExtraIds((prev) => [...prev, ""])}
        >
          <Plus className="size-3.5" /> Add another {label.toLowerCase()}
        </Button>
      )}

      {chosen > 1 && (
        <p className="text-xs text-muted-foreground">
          Everyone here gets their own invoice, split by your cost-splitting rules.
        </p>
      )}
    </div>
  );
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
      data-doc-shot="airworthiness-notice"
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
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              {squawkCountLabel(squawks.length)}
              <DocsHint topic="airworthiness-notice" />
            </p>
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
 * `variant: "self"` — a member booking themselves (/me/book, and the calendar when a
 * student, instructor, renter or technician clicks an empty slot). This is NOT a second
 * form: booking yourself is the same reservation with one personnel side already
 * filled in with you. Someone who is both an instructor and a student picks which
 * seat they're in, and the other side becomes the counterpart picker.
 *
 * `variant` is WHO is booking; `presentation` is where the form is drawn. They're
 * independent on purpose: the calendar hands a member the self variant in a modal, so
 * the slot they clicked survives instead of being traded for a trip to /me/book.
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
  presentation,
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
   * Which shell the form wears. Defaults to a page card for `self` (it IS the
   * /me/book page) and a modal for dispatch.
   *
   * The calendar passes "modal" for both: a student clicking an empty slot gets the
   * same form in the same place a dispatcher does, without being thrown off the board
   * to /me/book and losing the slot they just clicked.
   */
  presentation?: "page" | "modal";
  /**
   * Required when `variant === "self"`: the member doing the booking. Their
   * org-user id goes onto the reservation as the personnel; their user id loads
   * the fleet they're checked out on and their instruction partners.
   */
  self?: { orgUserId: number; userId: number };
}) {
  const { roles, organization } = useAuth();
  const tz = useTimeZone();
  const navigate = useNavigate();

  //Opt-in per school. Off, the End field is a time on the booking's own day, which is how
  //every booking has worked until now; on, a "Back on" date appears beside it. Read from the
  //org rather than passed in, because it is a property of the school and not of this form,
  //and this is the one booking form both the dispatch and self variants share.
  const allowMultiDay = organization?.bookingPolicy?.multiDayEnabled ?? false;

  const isSelf = variant === "self";
  //A self booking on /me/book renders as a page card, so there is no modal to close and
  //nowhere to go back to — Cancel and a successful create both leave for /me/schedule.
  //Opened from the calendar it is an ordinary modal, and every one of those closes.
  const asPage = (presentation ?? (isSelf ? "page" : "modal")) === "page";
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
   * What a fresh form opens on. The lane that was clicked wins where it says anything —
   * a room can only be a ground lesson — and the role default covers the rest.
   *
   * Still filtered through `typeOptions`, because the lanes a role can SEE and the types it
   * may CREATE are two different lists: a renter looking at a simulator lane would otherwise
   * open on `sim`, which the server refuses them.
   */
  const seedType = React.useMemo<ReservationType>(
    () => (draft.type && typeOptions.includes(draft.type) ? draft.type : initialType),
    [draft.type, typeOptions, initialType]
  );

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
  /**
   * NARROWED TO THE CHECKED-OUT FLEET ON EXACTLY THE TERMS THE SERVER REFUSES ON.
   *
   * This picker used to filter on `isSelf && type === "rental"`, which disagreed with the
   * server's rule in both directions:
   *
   *  - TOO NARROW. A school with the setting OFF has approvals as a RECORD and blocks
   *    nothing, yet a renter here saw only the tails they were approved on. A club that had
   *    never checked anybody out showed its renters an empty fleet and no way to book.
   *  - TOO WIDE. The server checks students and renters on every type it can seat them on,
   *    not rentals alone. A student self-booking a `dual` or a `sim` was offered the whole
   *    fleet, chose a tail nobody had checked them out on, filled in the form and met the
   *    refusal at Save.
   *
   * Both are now read off the same two facts the server reads: the org setting, and whether
   * the person booking is going to sit in a student or renter seat. Instructors are exempt
   * server-side, so somebody booking as the instructor keeps the whole fleet here too.
   */
  const approvedQ = useApprovedResources(self?.userId ?? 0, {
    enabled: open && isSelf && self != null,
  });
  const restrictToApproved =
    isSelf &&
    self != null &&
    organization?.preferences?.personnelCanOnlyUseApprovedResources === true &&
    !isStaff(roles) &&
    !selfIsInstructor;
  // ONE request per form open for the whole fleet, grouped by resource below —
  // never one per option row.
  // The org's default minimum, for the overnight disclosure. GET /organizations/billing is
  // isOrgUser(), so a member booking themselves can read it too.
  const billingQ = useBilling({ enabled: open });
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
  /**
   * The aircraft the calendar seeded that this member may not book — the name, so it can
   * be said out loud. Only a renter can reach it: their pool is the fleet they're checked
   * out on, and the board they clicked shows every lane.
   */
  const [unapprovedResource, setUnapprovedResource] = React.useState<string | null>(null);
  const [date, setDate] = React.useState("");
  const [startAt, setStartAt] = React.useState<Date | null>(null);
  const [endAt, setEndAt] = React.useState<Date | null>(null);
  const [instructorId, setInstructorId] = React.useState("");
  const [studentId, setStudentId] = React.useState("");
  const [renterId, setRenterId] = React.useState("");
  /**
   * Everyone on a side BEYOND the first — a group ground school's other students, or the
   * co-renters on a shared cross-country.
   *
   * The first person on a side stays its own single-select rather than the whole side
   * becoming a list, and that is a modelling choice rather than a shortcut: the leading
   * payer is meaningful. They are the one billed when the org's rule for that charge is
   * "one person pays", and they take the leftover cent of an uneven division. Making the
   * side a flat list would lose the distinction the server's payer ordering relies on.
   */
  const [extraStudentIds, setExtraStudentIds] = React.useState<string[]>([]);
  const [extraRenterIds, setExtraRenterIds] = React.useState<string[]>([]);
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
      //Also every ADDITIONAL person. Without this a group picker would keep offering
      //someone who is already three rows above it, and the server would reject the
      //booking for a duplicate the form had invited.
      for (const id of extraStudentIds) add("students", id);
      for (const id of extraRenterIds) add("renters", id);
      return taken;
    },
    [type, effectiveInstructorId, effectiveStudentId, effectiveRenterId, extraStudentIds, extraRenterIds]
  );

  /**
   * The ids already chosen on ONE side, so its own pickers don't offer the same person
   * twice. Separate from assignedElsewhere, which is about the OTHER sides.
   *
   * `exceptIndex` is the picker ASKING, and it must be left out of its own exclusion set —
   * a Combobox resolves its label by looking its value up in the options it was given, so
   * a picker that excludes its own selection renders the placeholder instead of the person
   * it is holding. `-1` means the leading picker; 0.. are the extras.
   */
  const takenOnSide = React.useCallback(
    (side: "students" | "renters", exceptIndex?: number): ReadonlySet<string> => {
      const primary = side === "students" ? effectiveStudentId : effectiveRenterId;
      const extras = side === "students" ? extraStudentIds : extraRenterIds;
      const taken = new Set<string>();
      if (primary && exceptIndex !== -1) taken.add(primary);
      extras.forEach((id, i) => {
        if (id && i !== exceptIndex) taken.add(id);
      });
      return taken;
    },
    [effectiveStudentId, effectiveRenterId, extraStudentIds, extraRenterIds]
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
    if (allows.includes("students")) {
      add(userIdOf(studentsQ.data, effectiveStudentId));
      //EVERY additional person's availability gates the slot too. Missing them would
      //offer a time that half the class can't make, and the server would then reject the
      //booking naming somebody the picker never mentioned.
      for (const id of extraStudentIds) add(userIdOf(studentsQ.data, id));
    }
    if (allows.includes("renters")) {
      add(userIdOf(rentersQ.data, effectiveRenterId));
      for (const id of extraRenterIds) add(userIdOf(rentersQ.data, id));
    }
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
      setUnapprovedResource(null);

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
        //Everyone beyond the first. Dropping them here would be silent: the form would
        //look right, and submitting would DISCONNECT them, because update() replaces
        //personnel wholesale.
        setExtraStudentIds((p?.students ?? []).slice(1).map((x) => String(x.id)));
        setExtraRenterIds((p?.renters ?? []).slice(1).map((x) => String(x.id)));
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
        //Everyone beyond the first. Dropping them here would be silent: the form would
        //look right, and submitting would DISCONNECT them, because update() replaces
        //personnel wholesale.
        setExtraStudentIds((p?.students ?? []).slice(1).map((x) => String(x.id)));
        setExtraRenterIds((p?.renters ?? []).slice(1).map((x) => String(x.id)));
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
        setType(seedType);
        setResourceId(draft.resourceId != null ? String(draft.resourceId) : "");
        setDate(format(draft.date, "yyyy-MM-dd"));
        setStartAt(seed(draft.start));
        setEndAt(seed(draft.end));
        setInstructorId("");
        setStudentId("");
        setRenterId("");
        setExtraStudentIds([]);
        setExtraRenterIds([]);
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
  }, [open, draft, seedType, editing, duplicating]);

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
    //Somebody booking themselves into a student or renter seat at a school that enforces
    //checkouts sees only what they are checked out on. Everyone else draws from the whole
    //fleet, narrowed to what the type needs. See `restrictToApproved`.
    const pool = restrictToApproved ? approvedQ.data ?? [] : resourcesQ.data ?? [];
    return pool.filter((r) => resourceMatchesType(r, type));
  }, [resourcesQ.data, approvedQ.data, type, restrictToApproved]);

  const resourceOptions: ComboOption[] = eligibleResources.map((r) => {
    const l = resourceLabel(r);
    // Airworthiness takes the hint slot when there's something to say — it's a
    // narrow, right-aligned, truncating column and "Grounded" earns that space
    // more than "Aircraft" does.
    const air = airworthinessHint(r, openSquawksByResourceId.get(r.id)?.length ?? 0);
    return { value: String(r.id), label: l.name, hint: air || l.kind };
  });

  const selectedResource = eligibleResources.find((r) => String(r.id) === resourceId);

  //Which fleet request has to land before the picker means anything.
  const fleetQ = restrictToApproved ? approvedQ : resourcesQ;

  // Switching type can strand a resource of the wrong kind in the picker's value.
  React.useEffect(() => {
    //Never while the fleet is still in flight. `eligibleResources` is empty until it
    //lands, so clearing on it would throw away the aircraft the calendar seeded — and a
    //renter's approved fleet is NEVER warm here, because nothing but this form asks for
    //it. The lane they clicked would just come up blank.
    if (fleetQ.isPending) return;
    if (resourceId && !eligibleResources.some((r) => String(r.id) === resourceId)) {
      //Say so when the reason is "not yours" rather than "wrong kind". A renter who
      //clicks the lane of a tail they aren't checked out on is otherwise handed an empty
      //Aircraft field with no explanation — the one case where the picker is narrower
      //than the board they clicked.
      if (restrictToApproved) {
        const name = (resourcesQ.data ?? []).find((r) => String(r.id) === resourceId);
        setUnapprovedResource(name ? resourceLabel(name).name : null);
      }
      setResourceId("");
    }
  }, [resourceId, eligibleResources, fleetQ.isPending, restrictToApproved, resourcesQ.data]);
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
    //"N172TS · Dual" is what they would have typed anyway.
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
        return setError("Enter a valid email. The guest's invoice is sent there.");
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

      //The leading payer FIRST, then anyone additional, in the order they were added.
      //Order is not cosmetic: the server bills the first person on a side when the org's
      //rule for a charge is "one person pays", and gives them the leftover cent of an
      //uneven division.
      const sideIds = (primary: string, extras: string[]) =>
        [primary, ...extras].filter(Boolean).map((id) => ({ id: Number(id) }));

      if (effectiveInstructorId && req.allows.includes("instructors"))
        personnel.instructors = [{ id: Number(effectiveInstructorId) }];
      if (effectiveStudentId && req.allows.includes("students"))
        personnel.students = sideIds(effectiveStudentId, extraStudentIds);
      if (effectiveRenterId && req.allows.includes("renters"))
        personnel.renters = sideIds(effectiveRenterId, extraRenterIds);

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
      if (isSelf && asPage) {
        ///me/book is a page with nothing behind it — send them to their schedule so they
        //can see what they just booked. From the calendar there's somewhere to go back
        //TO: the booking they made is already drawn on the board behind the modal.
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

  /**
   * When the self form can't be filled in at all: the fleet is still loading, the request
   * failed, or this member has nothing of that kind to book. Dispatch has none of these —
   * it keeps its inline "Loading…" placeholder in the picker.
   *
   * A NODE rather than an early return, because the form now wears two shells: this has
   * to render inside whichever one it is in, and a bare Card floating over the calendar
   * (with no way to dismiss it) is what returning early would have produced.
   */
  const selfGate = !isSelf ? null : fleetQ.isPending ? (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Loading…
    </div>
  ) : fleetQ.isError ? (
    <ErrorState error={fleetQ.error} onRetry={() => void fleetQ.refetch()} />
  ) : eligibleResources.length === 0 && TYPE_REQUIREMENTS[type].resourceRequired ? (
    <EmptyState
      icon={Ban}
      //Keyed on the restriction rather than on the type: with checkouts enforced, a
      //student with no approvals has nothing to book on a dual either, and telling them
      //the school "hasn't set up any aircraft" would send them to ask the wrong question.
      title={
        restrictToApproved
          ? "You're not checked out on any aircraft"
          : `No ${TYPE_REQUIREMENTS[type].resource.toLowerCase()}s to book`
      }
      body={
        restrictToApproved
          ? "Ask your school to approve you on the fleet you can fly."
          : `Your school hasn't set up any ${TYPE_REQUIREMENTS[
              type
            ].resource.toLowerCase()}s yet.`
      }
    />
  ) : null;

  const body = (
      <form onSubmit={submit} data-doc-shot="reservation-form-dispatch" className="space-y-4">
        {/* Dispatch names its bookings; a member's is generated from the aircraft
            and the type — see autoTitle. */}
        {!isSelf && (
          <div className="space-y-1.5">
            <Label htmlFor="res-title">Title</Label>
            <Input
              id="res-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pattern work in N12345"
              autoFocus
            />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="res-type">Type</Label>
              <DocsHint topic="reservation-type" />
            </div>
            <Select value={type} onValueChange={(v) => setType(v as ReservationType)}>
              <SelectTrigger id="res-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent data-doc-shot={isSelf ? "me-book-type-dropdown" : undefined}>
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
              onChange={(v) => {
                setResourceId(v);
                setUnapprovedResource(null);
              }}
              placeholder={resourcesQ.isLoading ? "Loading…" : "Select resource"}
              searchPlaceholder="Search fleet…"
              emptyText={`No ${TYPE_REQUIREMENTS[type].resource.toLowerCase()}s set up.`}
            />
            {unapprovedResource && (
              <p className="text-xs text-muted-foreground">
                You're not checked out on {unapprovedResource} — pick one you're approved
                to fly, or ask your school.
              </p>
            )}
          </div>
        </div>

        {/* Which seat the member is in, when they hold both roles. Dispatch never
            asks — it names both people outright. */}
        {seatIsAmbiguous && counterpartSide && (
          <div data-doc-shot="me-book-your-seat" className="space-y-1.5">
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
                    setExtraStudentIds([]);
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
          <>
            <AirworthinessNotice resource={selectedResource} squawks={selectedSquawks} />
            {/* Said at the moment the dates are chosen, which is the only moment it can stop
                somebody being surprised by the invoice. Inside the same maintenance guard as
                the notice above: a maintenance booking is never invoiced. */}
            <OvernightMinimumNotice
              start={startAt}
              end={endAt}
              timeZone={tz.zone}
              resource={selectedResource}
              orgMinimumTenths={billingQ.data?.overnightMinimumTenths ?? null}
            />
          </>
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
          // Say "simulator" or "room" when that is what is booked. resourceLabel already
          // classifies it for the picker's hint column, so there is no new lookup here.
          resourceNoun={
            selectedResource ? resourceLabel(selectedResource).kind.toLowerCase() : "resource"
          }
          personnelUserIds={personnelUserIds}
          allowMultiDay={allowMultiDay}
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
              <PeopleOnSide
                label="Student"
                pluralLabel="Students"
                side="students"
                type={type}
                roster={studentsQ.data}
                primaryId={studentId}
                setPrimaryId={setStudentId}
                extraIds={extraStudentIds}
                setExtraIds={setExtraStudentIds}
                assignedElsewhere={assignedElsewhere("students")}
                takenOnSide={takenOnSide}
                searchPlaceholder="Search students…"
                emptyText="No students."
              />
            )}
            {/* Where this student is in their syllabus, while the booking is still being
                made. Both competitors surface this here, and it is the moment it is useful:
                the person picking a slot is usually deciding what the lesson is. */}
            {!isSelf && TYPE_REQUIREMENTS[type].allows.includes("students") && (
              <NextLessonHint orgUserId={Number(effectiveStudentId) || null} type={type} />
            )}
            {!isSelf && TYPE_REQUIREMENTS[type].allows.includes("renters") && (
              <PeopleOnSide
                label="Renter"
                pluralLabel="Renters"
                side="renters"
                type={type}
                roster={rentersQ.data}
                primaryId={renterId}
                setPrimaryId={setRenterId}
                extraIds={extraRenterIds}
                setExtraIds={setExtraRenterIds}
                assignedElsewhere={assignedElsewhere("renters")}
                takenOnSide={takenOnSide}
                searchPlaceholder="Search renters…"
                emptyText="No renters."
              />
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
              isSelf && asPage ? void navigate({ to: "/me/schedule" }) : closeModal(false)
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

  const content = selfGate ?? body;

  //Wider than the default dialog: this form carries two person pickers, a smart time
  //range and the repeat control, and the narrower column was making rows of controls
  //overflow rather than wrap. /me/book is a page, so it gets a card instead.
  if (asPage) {
    return (
      <Card data-doc-shot="me-book-solo">
        {/* The gate states are whole-card empty/error states and bring their own
            framing — a header over "You're not checked out on any aircraft" reads as
            a form that failed rather than an answer. */}
        {!selfGate && (
          <CardHeader>
            <CardTitle>Book a reservation</CardTitle>
          </CardHeader>
        )}
        <CardContent className={cn(selfGate && "p-0")}>{content}</CardContent>
      </Card>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={closeModal}
      size="xl"
      title={isEditing ? "Edit reservation" : isSelf ? "Book yourself in" : "New reservation"}
      description={
        isEditing
          ? "Change the aircraft, crew or times for this reservation."
          : isSelf
            ? "You're on this reservation — pick what you're booking and when."
            : "Book an aircraft, simulator or room, and the people on it."
      }
    >
      {content}
    </ResponsiveModal>
  );
}
