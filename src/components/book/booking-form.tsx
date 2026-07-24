import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plane as PlaneIcon, Loader2, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import {
  useApprovedResources,
  useCreateReservation,
  useLocations,
  useMembers,
  usePlanes,
  useRatings,
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

/** Combine a `type=date` value and a `type=time` value into a UTC ISO string. */
function toISO(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
  const [mode, setMode] = useState<BookMode>(modes[0]);

  // Fleet: renters may only book aircraft they're checked out on.
  const approved = useApprovedResources(userId, { enabled: mode === "renter" });
  const planes = usePlanes({ enabled: mode !== "renter" });
  const aircraftQuery = mode === "renter" ? approved : planes;

  const locations = useLocations();
  const ratings = useRatings();
  const instructors = useMembers({ instructor: true }, { enabled: mode === "student" });

  // Form state
  const [resourceId, setResourceId] = useState("");
  const [type, setType] = useState<ReservationType>(TYPE_OPTIONS[modes[0]][0]);
  const [instructorId, setInstructorId] = useState("");
  const [ratingId, setRatingId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const create = useCreateReservation();

  const aircraft = aircraftQuery.data ?? [];
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
        return { value: String(r.id), label: name, hint };
      }),
    [aircraft]
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
    const start = toISO(date, startTime);
    const end = toISO(date, endTime);
    if (!start || !end) {
      toast.error("Choose a date, start time, and end time.");
      return;
    }
    if (new Date(end) <= new Date(start)) {
      toast.error("The end time must be after the start time.");
      return;
    }
    if (needsInstructor && !instructorId) {
      toast.error("Pick an instructor for the lesson.");
      return;
    }

    const locationId = resource.FK_locationId ?? locations.data?.[0]?.id;
    if (locationId == null) {
      toast.error("No location is set up yet. Ask your school to add one.");
      return;
    }

    const input: CreateReservationInput = {
      title: buildTitle(resource),
      type,
      start,
      end,
      timeZoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
      resource: { id: resource.id },
      location: { id: locationId },
      personnel: buildPersonnel(),
    };
    if (notes.trim()) input.notes = notes.trim();
    if (ratingId) input.rating = { id: Number(ratingId) };

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

          <div className="grid gap-5 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="book-date">Date</Label>
              <Input
                id="book-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-start">Start time</Label>
              <Input
                id="book-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="book-end">End time</Label>
              <Input
                id="book-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

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
