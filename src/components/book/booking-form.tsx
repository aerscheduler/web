import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plane as PlaneIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  canViewSquawks,
  isInstructor as hasInstructorRole,
  isStudent as hasStudentRole,
  isRenter,
  isTechnician,
  selfBookableTypes,
} from "@/lib/permissions";
import {
  useApprovedResources,
  useCreateReservation,
  useLocations,
  useMembers,
  useMyInstructionPartners,
  usePlanes,
  useRatings,
  useRooms,
  useSimulators,
  useSquawks,
} from "@/features/queries";
import { resourceLabel } from "@/types/api";
import type {
  CreateReservationInput,
  Resource,
  ReservationType,
} from "@/types/api";

import { Combobox } from "@/components/combobox";
import type { ComboOption } from "@/components/combobox";
import { ErrorState, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SmartTimeRange } from "@/components/schedule/smart-time-range";
import { TYPE_LABEL } from "@/components/schedule/meta";
import {
  TYPE_REQUIREMENTS,
  buildReservationInput,
  resolveLocationId,
  validatePersonnelForType,
  validateTimeRange,
} from "@/components/schedule/reservation-shared";
// Shared with the staff dispatch form so both pickers surface airworthiness
// identically. Read-only — neither form blocks a booking on it.
import {
  AirworthinessNotice,
  airworthinessHint,
  groupSquawksByResource,
} from "@/components/schedule/reservation-form";

/** Longer, self-serve phrasing for the type picker — "Dual" alone isn't obvious. */
const TYPE_BLURB: Partial<Record<ReservationType, string>> = {
  dual: "Dual (with an instructor)",
  solo: "Solo",
  rental: "Rental",
  ground: "Ground lesson",
  sim: "Simulator",
  guest: "Guest flight",
  maintenance: "Maintenance",
};

/**
 * Consequences worth stating once, under the field — not crammed into the
 * option label, where they'd read as part of the type's name.
 */
const TYPE_HINT: Partial<Record<ReservationType, string>> = {
  maintenance: "Blocks the aircraft for the whole window — nobody else can book it.",
};

const typeText = (t: ReservationType) => TYPE_BLURB[t] ?? TYPE_LABEL[t];

/** Required fields, in focus order, mapped to their input ids for error focus. */
const REQUIRED_FIELDS = [
  { key: "resourceId", id: "book-resource" },
  { key: "counterpartId", id: "book-counterpart" },
  { key: "guestName", id: "book-guest-name" },
  { key: "guestEmail", id: "book-guest-email" },
  { key: "date", id: "smart-date" },
  { key: "startAt", id: "smart-start" },
  { key: "endAt", id: "smart-end" },
] as const;

/** Empty-state copy per resource kind, so "no aircraft" doesn't appear on a room booking. */
const EMPTY_RESOURCE: Record<string, { title: string; body: string }> = {
  Aircraft: {
    title: "No aircraft to book",
    body: "There are no aircraft on the schedule yet. Ask your school to add aircraft to the fleet.",
  },
  Simulator: {
    title: "No simulators to book",
    body: "Your school hasn't set up any simulators yet.",
  },
  Room: {
    title: "No rooms to book",
    body: "Your school hasn't set up any ground-school rooms yet.",
  },
};

function apiErr(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe — try again.";
}

// -------------------------------------------------------------- component

export function BookingForm({
  orgUserId,
  userId,
}: {
  /** The caller's OrganizationUser.id — placed into personnel by role. */
  orgUserId: number;
  /** The caller's User.id — used to load their approved aircraft. */
  userId: number;
}) {
  const navigate = useNavigate();
  const { roles } = useAuth();

  // What this member may book comes straight from their roles — the same matrix
  // the Flutter app and the server's create gate use.
  const types = useMemo(() => selfBookableTypes(roles), [roles]);
  // Mirrors Flutter's default-type precedence: a renter+student defaults to a
  // rental, not a solo.
  const [type, setType] = useState<ReservationType>(() => {
    if (isRenter(roles) && types.includes("rental")) return "rental";
    if (isTechnician(roles) && types.length === 1) return "maintenance";
    return types.includes("solo") ? "solo" : types[0] ?? "solo";
  });

  const isInstructor = hasInstructorRole(roles);
  const isStudent = hasStudentRole(roles);
  /**
   * Someone who holds BOTH roles has to say which seat they're in on a shared
   * booking; anyone else is unambiguous. Mirrors Flutter's "I am instructing"
   * checkbox.
   */
  const seatIsAmbiguous = isInstructor && isStudent;
  const [asInstructor, setAsInstructor] = useState(isInstructor);
  const selfIsInstructor = seatIsAmbiguous ? asInstructor : isInstructor;

  const req = TYPE_REQUIREMENTS[type];
  const kind = req.resource;

  // Fleet: renters may only book aircraft they're checked out on. Every other
  // type draws from the full fleet of the matching kind.
  const rentalFleet = useApprovedResources(userId, { enabled: type === "rental" });
  const planes = usePlanes({ enabled: kind === "Aircraft" && type !== "rental" });
  const simulators = useSimulators({ enabled: kind === "Simulator" });
  const rooms = useRooms({ enabled: kind === "Room" });
  const resourceQuery =
    type === "rental"
      ? rentalFleet
      : kind === "Simulator"
        ? simulators
        : kind === "Room"
          ? rooms
          : planes;

  // GET /maintenance/squawks is staff/technician-only — it 403s for instructor,
  // student and renter, which is most of the people on this page. Gate on the
  // role so we never fire a request that's guaranteed to fail, and never render
  // its error: the notice below degrades to grounded-only, which is read straight
  // off the aircraft records already loaded. ONE request for the whole fleet,
  // grouped by resource in memory — never one per option row.
  const showSquawks = canViewSquawks(roles);
  const squawksQuery = useSquawks({ resolved: false }, { enabled: showSquawks });
  const openSquawksByResourceId = useMemo(
    () => groupSquawksByResource(squawksQuery.data),
    [squawksQuery.data]
  );

  const locations = useLocations();
  const ratings = useRatings();

  // The counterpart on a SHARED booking: whichever side the member isn't in. A
  // solo is excluded — the server rejects an instructor and a student together
  // on one, because that's a dual.
  const needsCounterpart =
    req.allows.includes("instructors") &&
    req.allows.includes("students") &&
    req.exclusive.length === 0;
  const counterpartSide: "instructors" | "students" = selfIsInstructor
    ? "students"
    : "instructors";
  const counterpartRequired = req.requiresAll.includes(counterpartSide);
  const counterparts = useMembers(
    selfIsInstructor ? { student: true } : { instructor: true },
    { enabled: needsCounterpart }
  );

  // Form state
  const [resourceId, setResourceId] = useState("");
  const [counterpartId, setCounterpartId] = useState("");
  const [ratingId, setRatingId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [date, setDate] = useState("");
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  // Errors stay hidden until the first submit — don't scold someone for fields
  // they haven't reached yet.
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateReservation();

  // Memoised because `?? []` mints a fresh array on every render while the query is
  // undefined, which would change the identity of every dependent useMemo below and
  // defeat the memoisation entirely.
  const allResources = useMemo(() => resourceQuery.data ?? [], [resourceQuery.data]);
  // The approved-resources endpoint returns every kind the member is checked out
  // on, so narrow it to the kind this type actually books.
  const resources = useMemo(
    () => allResources.filter((r) => resourceLabel(r).kind === kind),
    [allResources, kind]
  );
  const byId = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const r of resources) m.set(String(r.id), r);
    return m;
  }, [resources]);

  const resourceOptions: ComboOption[] = useMemo(
    () =>
      resources.map((r) => {
        const { name, kind: rKind } = resourceLabel(r);
        const plane = r.type?.plane;
        const hint = plane ? `${plane.make} ${plane.model}`.trim() || rKind : rKind;
        // Airworthiness takes the hint slot when there's something to say — it's a
        // narrow, right-aligned, truncating column and "Grounded" earns that space
        // more than the make/model does.
        const air = airworthinessHint(r, openSquawksByResourceId.get(r.id)?.length ?? 0);
        return { value: String(r.id), label: name, hint: air || hint };
      }),
    [resources, openSquawksByResourceId]
  );

  // Who you're actually paired with for instruction. The server lets a student
  // book ANY instructor, so this sorts rather than filters — your own come
  // first, everyone else stays reachable below them.
  const partners = useMyInstructionPartners(userId, { enabled: needsCounterpart });
  const myPartnerOrgUserIds = useMemo(() => {
    const list = selfIsInstructor ? partners.data?.students : partners.data?.instructors;
    return new Set((list ?? []).map((p) => p.orgUser?.id).filter((id): id is number => id != null));
  }, [partners.data, selfIsInstructor]);

  const counterpartOptions: ComboOption[] = useMemo(() => {
    const rows = (counterparts.data ?? [])
      // Never offer yourself as your own counterpart.
      .filter((ou) => ou.id !== orgUserId)
      .map((ou) => ({
        value: String(ou.id),
        label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
        hint: myPartnerOrgUserIds.has(ou.id)
          ? selfIsInstructor
            ? "Your student"
            : "Your instructor"
          : (ou.identifier ?? undefined),
        mine: myPartnerOrgUserIds.has(ou.id),
      }));
    return rows
      .sort((a, b) => Number(b.mine) - Number(a.mine) || a.label.localeCompare(b.label))
      .map(({ mine: _mine, ...opt }) => opt);
  }, [counterparts.data, orgUserId, myPartnerOrgUserIds, selfIsInstructor]);

  const ratingOptions: ComboOption[] = useMemo(
    () => (ratings.data ?? []).map((rt) => ({ value: String(rt.id), label: rt.name })),
    [ratings.data]
  );

  const selectedResource = byId.get(resourceId);
  const selectedSquawks = selectedResource
    ? openSquawksByResourceId.get(selectedResource.id) ?? []
    : [];

  // Per-field validity, derived every render so inline messages clear as you fix
  // them. The house idiom (see aircraft-form): never a silently-disabled submit —
  // keep Book live, and on click say exactly what's missing, in the field that's
  // missing it.
  const errors: Record<string, string> = {
    resourceId:
      req.resourceRequired && !selectedResource
        ? `Select ${kind === "Aircraft" ? "an aircraft" : `a ${kind.toLowerCase()}`}.`
        : "",
    counterpartId:
      needsCounterpart && counterpartRequired && !counterpartId
        ? `Select ${counterpartSide === "instructors" ? "an instructor" : "a student"}.`
        : "",
    guestName: type === "guest" && !guestName.trim() ? "Enter the guest's name." : "",
    guestEmail:
      type === "guest" && !/.+@.+\..+/.test(guestEmail.trim())
        ? "Enter a valid email — the guest's invoice is sent there."
        : "",
    date: !date ? "Pick a date." : "",
    startAt: date && !startAt ? "Pick a start time." : "",
    endAt: startAt && !endAt ? "Pick an end time." : "",
  };
  const firstInvalid = REQUIRED_FIELDS.find((f) => errors[f.key]);

  // A resource chosen for one type is meaningless for another (an aircraft can't
  // host a ground lesson), so drop it whenever the required kind changes.
  useEffect(() => {
    if (resourceId && !byId.has(resourceId)) setResourceId("");
  }, [resourceId, byId]);

  // Everyone whose availability gates the slot: the member themselves, plus the
  // counterpart once picked. USER ids for /availability/user/:id. A maintenance
  // booking has no personnel, so only the aircraft's own availability applies.
  const personnelUserIds = useMemo(() => {
    if (type === "maintenance") return [];
    const ids = [userId];
    if (needsCounterpart && counterpartId) {
      const u = counterparts.data?.find((ou) => String(ou.id) === counterpartId)?.user?.id;
      if (u != null) ids.push(u);
    }
    return ids;
  }, [userId, type, needsCounterpart, counterpartId, counterparts.data]);

  function onTypeChange(next: ReservationType) {
    setType(next);
    setResourceId("");
    setCounterpartId("");
  }

  function buildTitle(resource: Resource | undefined): string {
    const name = resource ? resourceLabel(resource).name : "";
    return name ? `${name} — ${TYPE_LABEL[type]}` : TYPE_LABEL[type];
  }

  function buildPersonnel(): CreateReservationInput["personnel"] | undefined {
    // Maintenance takes the aircraft off the line; the server rejects it if
    // anyone is attached.
    if (type === "maintenance") return undefined;

    const self = { id: orgUserId };
    if (type === "rental") return { renters: [self] };
    if (type === "guest") {
      const personnel: NonNullable<CreateReservationInput["personnel"]> = {
        guests: [{ name: guestName.trim(), email: guestEmail.trim() }],
      };
      // A guest can't fly alone — an instructor takes them up.
      if (isInstructor) personnel.instructors = [self];
      return personnel;
    }

    const personnel: NonNullable<CreateReservationInput["personnel"]> = selfIsInstructor
      ? { instructors: [self] }
      : { students: [self] };
    if (needsCounterpart && counterpartId) {
      personnel[counterpartSide] = [{ id: Number(counterpartId) }];
    }
    return personnel;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // Rather than a silently-disabled button, surface every gap at once and put
    // the cursor in the first one.
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    const resource = byId.get(resourceId);
    const timeError = validateTimeRange(startAt, endAt);
    if (timeError) {
      setShowErrors(true);
      setFormError(timeError);
      return;
    }

    const personnel = buildPersonnel();
    // A last backstop against the server's type matrix — anything reaching here
    // isn't a field the member can fix, so it belongs at form level.
    const personnelError = validatePersonnelForType(type, personnel);
    if (personnelError) {
      setFormError(personnelError);
      return;
    }

    const locationId = resolveLocationId(resource, locations.data);
    if (locationId == null) {
      setFormError("No location is set up yet. Ask your school to add one.");
      return;
    }
    setFormError(null);

    const input = buildReservationInput({
      title: buildTitle(resource),
      type,
      startAt: startAt!,
      endAt: endAt!,
      resourceId: resource?.id ?? null,
      locationId,
      personnel,
      notes,
      ratingId: ratingId ? Number(ratingId) : null,
    });

    try {
      await create.mutateAsync(input);
      toast.success("Booked");
      await navigate({ to: "/me/schedule" });
    } catch (err) {
      const msg = apiErr(err);
      if (/no longer available|not available/i.test(msg)) {
        toast.error(
          `${msg} This ${kind.toLowerCase()} may not have availability set yet — ask your school to set its available hours.`
        );
      } else {
        toast.error(msg);
      }
    }
  }

  // -------------------- resource list states
  if (resourceQuery.isPending) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </CardContent>
      </Card>
    );
  }

  if (resourceQuery.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={resourceQuery.error} onRetry={() => void resourceQuery.refetch()} />
        </CardContent>
      </Card>
    );
  }

  const submitting = create.isPending;
  const noResources = resources.length === 0;
  const empty = EMPTY_RESOURCE[kind];

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Book a reservation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="book-type">Reservation type</Label>
              <Select value={type} onValueChange={(v) => onTypeChange(v as ReservationType)}>
                <SelectTrigger id="book-type" className="w-full">
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t} value={t}>
                      {typeText(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {TYPE_HINT[type] && (
                <p className="text-xs text-muted-foreground">{TYPE_HINT[type]}</p>
              )}
            </div>

            {seatIsAmbiguous && needsCounterpart && (
              <div className="space-y-2">
                <Label>Your seat</Label>
                {/* `flex`, not `inline-flex`: an inline-level box sits on the SAME LINE
                    as the label, which jammed "Your seat" against the first button while
                    every other field in this grid stacks. `w-fit` keeps it from
                    stretching the full column now that it's block-level. */}
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
                        setCounterpartId("");
                      }}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* One column, like every other field here. It used to span both, which
                made the aircraft picker twice the width of the type and rating pickers
                beside it — three stacked comboboxes, the middle one visibly wrong. The
                empty state still spans, because a full-width card in half a column
                looks broken. */}
            <div className={cn("space-y-2", noResources && "sm:col-span-2")}>
              <Label>{kind === "Aircraft" ? "Aircraft" : kind}</Label>
              {noResources ? (
                <EmptyState
                  icon={PlaneIcon}
                  title={
                    type === "rental"
                      ? "You're not checked out on any aircraft"
                      : empty?.title ?? "Nothing to book"
                  }
                  body={
                    type === "rental"
                      ? "Ask your school to approve you on the fleet you can fly."
                      : empty?.body ?? ""
                  }
                />
              ) : (
                <>
                  <Combobox
                    id="book-resource"
                    invalid={showErrors && !!errors.resourceId}
                    options={resourceOptions}
                    value={resourceId}
                    onChange={setResourceId}
                    placeholder={`Select ${kind === "Aircraft" ? "an aircraft" : `a ${kind.toLowerCase()}`}…`}
                    searchPlaceholder="Search…"
                    emptyText="No matches."
                  />
                  {showErrors && errors.resourceId && (
                    <p className="text-xs text-destructive">{errors.resourceId}</p>
                  )}
                  {/* Advisory only — Book stays enabled. The server decides what it
                      will accept; the member just shouldn't be surprised by it.
                      Skipped for maintenance: the person booking the work knows
                      the aircraft's state, and this can't know what they're
                      actually there to fix. */}
                  {type !== "maintenance" && (
                    <AirworthinessNotice
                      resource={selectedResource}
                      squawks={selectedSquawks}
                    />
                  )}
                </>
              )}
            </div>

            {needsCounterpart && (
              <div className="space-y-2">
                <Label>
                  {counterpartSide === "instructors" ? "Instructor" : "Student"}
                  {!counterpartRequired && " (optional)"}
                </Label>
                {counterparts.isError ? (
                  <p className="text-sm text-destructive">
                    Couldn&rsquo;t load {counterpartSide}.
                  </p>
                ) : (
                  <Combobox
                    id="book-counterpart"
                    invalid={showErrors && !!errors.counterpartId}
                    options={counterpartOptions}
                    value={counterpartId}
                    onChange={setCounterpartId}
                    placeholder={
                      counterparts.isPending
                        ? "Loading…"
                        : counterpartSide === "instructors"
                          ? "Select an instructor…"
                          : "Select a student…"
                    }
                    searchPlaceholder="Search…"
                    emptyText="Nobody found."
                    disabled={counterparts.isPending}
                  />
                )}
                {showErrors && errors.counterpartId && (
                  <p className="text-xs text-destructive">{errors.counterpartId}</p>
                )}
              </div>
            )}

            {type === "guest" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="book-guest-name">Guest name</Label>
                  <Input
                    id="book-guest-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Who's flying with you?"
                    aria-invalid={showErrors && !!errors.guestName}
                  />
                  {showErrors && errors.guestName && (
                    <p className="text-xs text-destructive">{errors.guestName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="book-guest-email">Guest email</Label>
                  <Input
                    id="book-guest-email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="Where their invoice goes"
                    aria-invalid={showErrors && !!errors.guestEmail}
                  />
                  {showErrors && errors.guestEmail && (
                    <p className="text-xs text-destructive">{errors.guestEmail}</p>
                  )}
                </div>
              </>
            )}

            {type !== "maintenance" && type !== "rental" && (
              <div className="space-y-2">
                <Label>Rating (optional)</Label>
                <Combobox
                  options={ratingOptions}
                  value={ratingId}
                  onChange={setRatingId}
                  placeholder="No rating"
                  searchPlaceholder="Search ratings…"
                  emptyText="No ratings set up."
                />
              </div>
            )}
          </div>

          <Separator />

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
          />
          {showErrors && (errors.date || errors.startAt || errors.endAt) && (
            <p className="text-xs text-destructive">
              {errors.date || errors.startAt || errors.endAt}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="book-notes">Notes (optional)</Label>
            <Textarea
              id="book-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                type === "maintenance"
                  ? "What's being done to the aircraft…"
                  : "Anything the school should know about this booking…"
              }
              rows={3}
            />
          </div>
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/me/schedule" })}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || noResources}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Book
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
