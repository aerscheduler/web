import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { WorkOrder } from "@/types/api";
import { useCreateWorkOrder, useMembers, useUpdateWorkOrder, useWorkOrders } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders } from "@/lib/permissions";
import { isOpenWorkOrder } from "@/lib/work-orders";
import { Combobox, MultiCombobox, type ComboOption } from "@/components/combobox";
import { WorkspaceUserAvatars } from "@/components/workspace-user-avatar";
import { Label } from "@/components/ui/label";

/**
 * A maintenance booking and the job it holds (Tony, 2026-10-01). A booking has nobody on it: the
 * aircraft is what is busy. The people doing the work, what they are doing and what it costs
 * live on the work order, so the booking links one (an open job on that aircraft, or a new one
 * opened with it) instead of growing a technician list of its own. Only for people who may open
 * work orders: a dispatcher books the hangar time and never sees the job behind it.
 */
export type MaintenanceJobChoice = { mode: "none" } | { mode: "existing"; jobId: number } | { mode: "new"; technicianIds: string[] };

const NONE = "none";
const NEW = "new";

/** The job a booking holds, for the people who may see jobs; null when it holds none. */
export function useBookingJob(bookingId: number | null | undefined) {
  const { roles } = useAuth();
  const allowed = canOpenWorkOrders(roles) && bookingId != null;
  const q = useWorkOrders({ state: "all", reservationId: bookingId ?? undefined }, { enabled: allowed });
  // Matched here as well as by the server's filter: an API that ignored `reservationId` would
  // otherwise hand back the organization's first job as this booking's, and saving would unlink it.
  const job = (q.data ?? []).find((j) => j.booking?.id === bookingId) ?? null;
  return { allowed, job, loading: allowed && q.isPending };
}

export function MaintenanceJobField({
  resourceId,
  value,
  onChange,
  linked,
  formatBooking,
}: {
  resourceId: number | null;
  value: MaintenanceJobChoice;
  onChange: (v: MaintenanceJobChoice) => void;
  /** The job the booking already holds, when editing one. */
  linked: WorkOrder | null;
  /** How a job's other booking reads ("Oct 3, 9:00 AM"), in the airport's zone. */
  formatBooking?: (iso: string) => string;
}) {
  const jobsQ = useWorkOrders({ state: "open", resourceId: resourceId ?? undefined }, { enabled: resourceId != null });
  const membersQ = useMembers(undefined, { enabled: value.mode === "new" });
  const jobs = React.useMemo(() => {
    const open = (jobsQ.data ?? []).filter(isOpenWorkOrder);
    return linked && !open.some((j) => j.id === linked.id) ? [linked, ...open] : open;
  }, [jobsQ.data, linked]);
  const options: ComboOption[] = [
    { value: NONE, label: "No work order", hint: "Just the booking" },
    ...jobs.map((j) => {
      // A job already holding another booking moves to this one if picked: say so up front.
      const elsewhere = j.booking && !j.booking.cancelled && j.id !== linked?.id ? j.booking : null;
      return {
        value: String(j.id),
        label: `${j.label} ${j.complaint ? `· ${j.complaint}` : ""}`.trim(),
        hint: elsewhere ? `${j.statusLabel}, booked ${formatBooking ? formatBooking(elsewhere.start) : new Date(elsewhere.start).toLocaleDateString()}` : j.statusLabel,
      };
    }),
  ];
  const technicianOptions: ComboOption[] = (membersQ.data ?? [])
    .filter((m) => !m.external && m.technicianRole)
    .map((m) => ({ value: String(m.id), label: m.user?.name ?? `Member #${m.id}` }));
  const chosen = value.mode === "existing" ? jobs.find((j) => j.id === value.jobId) ?? null : null;
  const selectValue = value.mode === "existing" ? String(value.jobId) : value.mode === "new" ? NEW : NONE;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="res-work-order">Work order</Label>
        <Combobox
          id="res-work-order"
          options={value.mode === "new" ? [{ value: NEW, label: "A new work order", hint: "Opened with this booking" }, ...options] : options}
          value={selectValue}
          onChange={(v) => onChange(v === NONE ? { mode: "none" } : v === NEW ? { mode: "new", technicianIds: [] } : { mode: "existing", jobId: Number(v) })}
          placeholder={resourceId == null ? "Pick the aircraft first" : "No work order"}
          searchPlaceholder="Search jobs…"
          emptyText="No open jobs on this aircraft."
          disabled={resourceId == null}
          action={{ label: "Open a new work order", onSelect: () => onChange({ mode: "new", technicianIds: [] }) }}
        />
        <p className="text-xs text-muted-foreground">
          {value.mode === "new"
            ? "Opened with this booking. What you write in the notes below becomes the job's request."
            : chosen?.booking && !chosen.booking.cancelled && chosen.id !== linked?.id
              ? "This job holds another booking. Saving moves it to this one."
              : chosen
                ? "The booking holds this job on the schedule."
                : "The job holds who does the work, what is done, and the bill."}
        </p>
      </div>
      {value.mode === "new" && (
        <div className="space-y-1.5">
          <Label>Technicians</Label>
          <MultiCombobox
            options={technicianOptions}
            values={value.technicianIds}
            onChange={(ids) => onChange({ mode: "new", technicianIds: ids })}
            placeholder="Who is doing the work"
            searchPlaceholder="Search technicians…"
            emptyText="Nobody has the technician role."
          />
        </div>
      )}
      {chosen && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Technicians:</span>
          {chosen.technicians.length ? <WorkspaceUserAvatars people={chosen.technicians} /> : <span>nobody assigned yet</span>}
          <Link to="/maintenance/work-orders/$workOrderId" params={{ workOrderId: String(chosen.id) }} className="text-foreground underline-offset-2 hover:underline">
            Open {chosen.label}
          </Link>
        </p>
      )}
    </div>
  );
}

/**
 * After the booking is saved: open the new job on it, link the chosen one, and release the job
 * it held before if the choice moved away from it. Returns the job now held, for the toast.
 */
export function useApplyMaintenanceJob() {
  const create = useCreateWorkOrder();
  const update = useUpdateWorkOrder();
  return async ({
    choice,
    bookingId,
    resourceId,
    request,
    previousJobId,
    startsAt,
  }: {
    choice: MaintenanceJobChoice;
    bookingId: number;
    resourceId: number;
    request: string;
    previousJobId: number | null;
    startsAt: Date;
  }): Promise<WorkOrder | null> => {
    const keep = choice.mode === "existing" ? choice.jobId : null;
    // The new link first, the release after: a link that fails leaves the booking holding the
    // job it had, not none at all.
    const release = async () => {
      if (previousJobId != null && previousJobId !== keep) await update.mutateAsync({ id: previousJobId, reservationId: null });
    };
    if (choice.mode === "existing") {
      if (choice.jobId === previousJobId) return null;
      const linkedJob = await update.mutateAsync({ id: choice.jobId, reservationId: bookingId });
      await release();
      return linkedJob;
    }
    if (choice.mode === "new") {
      const opened = await create.mutateAsync({
        resourceId,
        reservationId: bookingId,
        // Booked ahead is Scheduled; a booking that has already started has the aircraft here.
        status: startsAt.getTime() > Date.now() ? "scheduled" : "received",
        complaint: request.trim() || null,
        technicianOrgUserIds: choice.technicianIds.map(Number),
      });
      await release();
      return opened;
    }
    await release();
    return null;
  };
}
