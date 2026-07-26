import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plane as PlaneIcon, Loader2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isStaff, isTechnician } from "@/lib/permissions";
import {
  useApprovedResources,
  useCreateReservation,
  useLocations,
  useMembers,
  usePlanes,
  useRatings,
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
import { Label } from "@/components/ui/label";
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
import {
  buildReservationInput,
  resolveLocationId,
  validateTimeRange,
} from "@/components/schedule/reservation-shared";
// Shared with the staff dispatch form so both pickers surface airworthiness
// identically. Read-only — neither form blocks a booking on it.
import {
  AirworthinessNotice,
  airworthinessHint,
  groupSquawksByResource,
} from "@/components/schedule/reservation-form";

// -------------------------------------------------------------- booking modes

export type BookMode = "renter" | "student" | "instructor";

const MODE_LABEL: Record<BookMode, string> = {
  renter: "Rent solo",
  student: "Book a lesson",
  instructor: "Instruct",
};

const TYPE_LABEL: Record<ReservationType, string> = {
  ground: "Ground",
  dual: "Dual (with instructor)",
  instructor: "Instructor",
  solo: "Solo",
  sim: "Simulator",
  rental: "Rental",
  guest: "Guest",
  maintenance: "Maintenance",
};

/**
 * Reservation types offered per booking mode, first entry is the default.
 * A renter flying a plane on their own is a `rental` (the server rejects `solo`/`ground`/`sim`
 * when a renter is on the reservation — those require an instructor or student).
 */
const TYPE_OPTIONS: Record<BookMode, ReservationType[]> = {
  renter: ["rental"],
  student: ["dual"],
  instructor: ["solo"],
};

function apiErr(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe — try again.";
}

// -------------------------------------------------------------- component

export function BookingForm({
  modes,
  orgUserId,
  userId,
}: {
  /** Booking modes the current member is eligible for (at least one). */
  modes: BookMode[];
  /** The caller's OrganizationUser.id — placed into personnel by role. */
  orgUserId: number;
  /** The caller's User.id — used to load their approved aircraft. */
  userId: number;
}) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const [mode, setMode] = useState<BookMode>(modes[0]);

  // Fleet: renters may only book aircraft they're checked out on.
  const approved = useApprovedResources(userId, { enabled: mode === "renter" });
  const planes = usePlanes({ enabled: mode !== "renter" });
  const aircraftQuery = mode === "renter" ? approved : planes;

  // GET /maintenance/squawks is staff/technician-only — it 403s for instructor,
  // student and renter, which is most of the people on this page. Gate on the
  // role so we never fire a request that's guaranteed to fail, and never render
  // its error: the notice below degrades to grounded-only, which is read straight
  // off the aircraft records already loaded. ONE request for the whole fleet,
  // grouped by resource in memory — never one per option row.
  const canSeeSquawks = isStaff(roles) || isTechnician(roles);
  const squawksQuery = useSquawks({ resolved: false }, { enabled: canSeeSquawks });
  const openSquawksByResourceId = useMemo(
    () => groupSquawksByResource(squawksQuery.data),
    [squawksQuery.data]
  );

  const locations = useLocations();
  const ratings = useRatings();
  const instructors = useMembers({ instructor: true }, { enabled: mode === "student" });

  // Form state
  const [resourceId, setResourceId] = useState("");
  const [type, setType] = useState<ReservationType>(TYPE_OPTIONS[modes[0]][0]);
  const [instructorId, setInstructorId] = useState("");
  const [ratingId, setRatingId] = useState("");
  const [date, setDate] = useState("");
  const [startAt, setStartAt] = useState<Date | null>(null);
  const [endAt, setEndAt] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");

  const create = useCreateReservation();

  // Memoised because `?? []` mints a fresh array on every render while the query is
  // undefined, which would change the identity of every dependent useMemo below and
  // defeat the memoisation entirely.
  const aircraft = useMemo(() => aircraftQuery.data ?? [], [aircraftQuery.data]);
  const byId = useMemo(() => {
    const m = new Map<string, Resource>();
    for (const r of aircraft) m.set(String(r.id), r);
    return m;
  }, [aircraft]);

  const aircraftOptions: ComboOption[] = useMemo(
    () =>
      aircraft.map((r) => {
        const { name, kind } = resourceLabel(r);
        const plane = r.type?.plane;
        const hint = plane ? `${plane.make} ${plane.model}`.trim() || kind : kind;
        // Airworthiness takes the hint slot when there's something to say — it's a
        // narrow, right-aligned, truncating column and "Grounded" earns that space
        // more than the make/model does.
        const air = airworthinessHint(r, openSquawksByResourceId.get(r.id)?.length ?? 0);
        return { value: String(r.id), label: name, hint: air || hint };
      }),
    [aircraft, openSquawksByResourceId]
  );

  const instructorOptions: ComboOption[] = useMemo(
    () =>
      (instructors.data ?? []).map((ou) => ({
        value: String(ou.id),
        label: ou.user?.name ?? ou.identifier ?? `Member #${ou.id}`,
        hint: ou.identifier ?? undefined,
      })),
    [instructors.data]
  );

  const ratingOptions: ComboOption[] = useMemo(
    () => (ratings.data ?? []).map((rt) => ({ value: String(rt.id), label: rt.name })),
    [ratings.data]
  );

  const typeOptions = TYPE_OPTIONS[mode];
  const needsInstructor = mode === "student";

  const selectedAircraft = byId.get(resourceId);
  const selectedSquawks = selectedAircraft
    ? openSquawksByResourceId.get(selectedAircraft.id) ?? []
    : [];

  // Everyone whose availability gates the slot: the member themselves, plus the
  // instructor when booking a lesson. USER ids for /availability/user/:id.
  const personnelUserIds = useMemo(() => {
    const ids = [userId];
    if (mode === "student" && instructorId) {
      const u = instructors.data?.find((ou) => String(ou.id) === instructorId)?.user?.id;
      if (u != null) ids.push(u);
    }
    return ids;
  }, [userId, mode, instructorId, instructors.data]);

  function onModeChange(next: BookMode) {
    setMode(next);
    setType(TYPE_OPTIONS[next][0]);
    setResourceId("");
    if (next !== "student") setInstructorId("");
  }

  function buildTitle(resource: Resource | undefined): string {
    const name = resource ? resourceLabel(resource).name : "";
    if (mode === "student") return name ? `${name} — Lesson` : "Lesson";
    return name ? `${name} — ${TYPE_LABEL[type]}` : TYPE_LABEL[type];
  }

  function buildPersonnel(): NonNullable<CreateReservationInput["personnel"]> {
    const self = { id: orgUserId };
    if (mode === "renter") return { renters: [self] };
    if (mode === "instructor") return { instructors: [self] };
    // student
    const personnel: NonNullable<CreateReservationInput["personnel"]> = {
      students: [self],
    };
    if (instructorId) personnel.instructors = [{ id: Number(instructorId) }];
    return personnel;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    const resource = byId.get(resourceId);
    if (!resource) {
      toast.error("Pick an aircraft to book.");
      return;
    }
    const timeError = validateTimeRange(startAt, endAt);
    if (timeError) {
      toast.error(timeError === "Pick a start and end time." ? "Choose a date, start time, and end time." : timeError);
      return;
    }
    if (needsInstructor && !instructorId) {
      toast.error("Pick an instructor for the lesson.");
      return;
    }

    const locationId = resolveLocationId(resource, locations.data);
    if (locationId == null) {
      toast.error("No location is set up yet. Ask your school to add one.");
      return;
    }

    const input = buildReservationInput({
      title: buildTitle(resource),
      type,
      startAt: startAt!,
      endAt: endAt!,
      resourceId: resource.id,
      locationId,
      personnel: buildPersonnel(),
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
          `${msg} This aircraft may not have availability set yet — ask your school to set its available hours.`
        );
      } else {
        toast.error(msg);
      }
    }
  }

  // -------------------- aircraft list states
  if (aircraftQuery.isPending) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your aircraft…
        </CardContent>
      </Card>
    );
  }

  if (aircraftQuery.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={aircraftQuery.error} onRetry={() => void aircraftQuery.refetch()} />
        </CardContent>
      </Card>
    );
  }

  if (aircraft.length === 0) {
    return (
      <Card>
        <CardContent className="p-0">
          <EmptyState
            icon={PlaneIcon}
            title="No aircraft to book"
            body={
              mode === "renter"
                ? "You're not checked out on any aircraft yet. Ask your school to approve you on the fleet you can fly."
                : "There are no aircraft on the schedule yet. Ask your school to add aircraft to the fleet."
            }
          />
        </CardContent>
      </Card>
    );
  }

  const submitting = create.isPending;

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Book a reservation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {modes.length > 1 && (
            <div className="space-y-2">
              <Label>How are you flying?</Label>
              <div
                role="radiogroup"
                aria-label="Booking mode"
                className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
              >
                {modes.map((m) => {
                  const active = m === mode;
                  return (
                    <Button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      onClick={() => onModeChange(m)}
                    >
                      {m === "student" ? (
                        <GraduationCap className="size-4" />
                      ) : (
                        <PlaneIcon className="size-4" />
                      )}
                      {MODE_LABEL[m]}
                    </Button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Aircraft</Label>
              <Combobox
                options={aircraftOptions}
                value={resourceId}
                onChange={setResourceId}
                placeholder="Select an aircraft…"
                searchPlaceholder="Search fleet…"
                emptyText="No matching aircraft."
              />
              {/* Advisory only — Book stays enabled. The server decides what it
                  will accept; the member just shouldn't be surprised by it. */}
              <AirworthinessNotice resource={selectedAircraft} squawks={selectedSquawks} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-type">Reservation type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReservationType)}>
                <SelectTrigger id="book-type" className="w-full">
                  <SelectValue placeholder="Select a type…" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {needsInstructor && (
              <div className="space-y-2">
                <Label>Instructor</Label>
                {instructors.isError ? (
                  <p className="text-sm text-destructive">Couldn&rsquo;t load instructors.</p>
                ) : (
                  <Combobox
                    options={instructorOptions}
                    value={instructorId}
                    onChange={setInstructorId}
                    placeholder={
                      instructors.isPending ? "Loading instructors…" : "Select an instructor…"
                    }
                    searchPlaceholder="Search instructors…"
                    emptyText="No instructors found."
                    disabled={instructors.isPending}
                  />
                )}
              </div>
            )}

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

          <div className="space-y-2">
            <Label htmlFor="book-notes">Notes (optional)</Label>
            <Textarea
              id="book-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the school should know about this booking…"
              rows={3}
            />
          </div>
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
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Book
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
