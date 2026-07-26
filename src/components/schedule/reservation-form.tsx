import * as React from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  useCreateReservation,
  useLocations,
  useMembers,
  useRatings,
  useResources,
} from "@/features/queries";
import {
  resourceLabel,
  type CreateReservationInput,
  type OrganizationUser,
  type Reservation,
  type ReservationType,
} from "@/types/api";
import { ApiError } from "@/lib/api";
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
import { DOT_CLASS, TYPE_ORDER, typeLabel } from "./meta";
import { SmartTimeRange } from "./smart-time-range";
import {
  buildReservationInput,
  resolveLocationId,
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

/** Modal form that creates a reservation. */
export function ReservationForm({
  open,
  onOpenChange,
  draft,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ReservationDraft;
  /** Called with the created reservation after a successful booking (e.g. to
   * navigate to it). The board doesn't pass this; the global "+" does. */
  onCreated?: (reservation: Reservation) => void;
}) {
  const resourcesQ = useResources({ enabled: open });
  const instructorsQ = useMembers({ instructor: true }, { enabled: open });
  const studentsQ = useMembers({ student: true }, { enabled: open });
  const rentersQ = useMembers({ renter: true }, { enabled: open });
  const ratingsQ = useRatings({ enabled: open });
  const locationsQ = useLocations({ enabled: open });
  const create = useCreateReservation();

  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState<ReservationType>("dual");
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

  const isGuest = type === "guest";

  // Everyone assigned must be free for the slot — feed their USER ids to the
  // smart time picker so it intersects their availability with the aircraft's.
  const personnelUserIds = React.useMemo(() => {
    const ids: number[] = [];
    const add = (id: number | null) => id != null && ids.push(id);
    add(userIdOf(instructorsQ.data, instructorId));
    if (!isGuest) {
      add(userIdOf(studentsQ.data, studentId));
      add(userIdOf(rentersQ.data, renterId));
    }
    return ids;
  }, [instructorId, studentId, renterId, isGuest, instructorsQ.data, studentsQ.data, rentersQ.data]);

  // Re-seed the form each time it opens (from the draft the board handed us).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      const seed = (hhmm?: string): Date | null => {
        if (!hhmm) return null;
        const d = new Date(`${format(draft.date, "yyyy-MM-dd")}T${hhmm}:00`);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      setTitle("");
      setType("dual");
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
      setError(null);
    }
    wasOpen.current = open;
  }, [open, draft]);

  const resourceOptions: ComboOption[] = (resourcesQ.data ?? []).map((r) => {
    const l = resourceLabel(r);
    return { value: String(r.id), label: l.name, hint: l.kind };
  });
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

    const chosenResource = resourcesQ.data?.find((r) => String(r.id) === resourceId);
    const locationId = resolveLocationId(chosenResource, locationsQ.data);

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
      // The server enforces per-type personnel + resource rules; validate here so
      // the happy path doesn't 400 with an opaque "Reservation type is not valid".
      const kind = chosenResource ? resourceLabel(chosenResource).kind : null;
      if (type === "dual" && !(instructorId && studentId))
        return setError("Dual flights need both an instructor and a student.");
      if (type === "solo" && !(instructorId || studentId))
        return setError("Solo flights need an instructor or a student.");
      if (type === "rental" && !renterId)
        return setError("Rentals need a renter.");
      if (type === "ground") {
        if (!(instructorId || studentId))
          return setError("Ground sessions need an instructor or a student.");
        if (kind !== "Room") return setError("Ground sessions need a room resource.");
      }
      if (type === "sim") {
        if (!(instructorId || studentId))
          return setError("Sim sessions need an instructor or a student.");
        if (kind !== "Simulator")
          return setError("Sim sessions need a simulator resource.");
      }

      if (instructorId) personnel.instructors = [{ id: Number(instructorId) }];
      if (studentId) personnel.students = [{ id: Number(studentId) }];
      if (renterId) personnel.renters = [{ id: Number(renterId) }];
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

    try {
      const created = await create.mutateAsync(input);
      toast.success("Reservation booked");
      onOpenChange(false);
      onCreated?.(created);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't book the reservation";
      setError(msg);
      toast.error(msg);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="New reservation"
      description="Book aircraft, instructors and students onto the dispatch board."
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
                {TYPE_ORDER.map((t) => (
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
            <Label>Aircraft / resource</Label>
            <Combobox
              options={resourceOptions}
              value={resourceId}
              onChange={setResourceId}
              placeholder={resourcesQ.isLoading ? "Loading…" : "Select resource"}
              searchPlaceholder="Search fleet…"
              emptyText="No resources."
            />
          </div>
        </div>

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
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
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
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Booking…" : "Book reservation"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
