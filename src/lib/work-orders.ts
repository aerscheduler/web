import type { WorkOrder, WorkOrderStatus } from "@/types/api";

/**
 * The work order's vocabulary on the console. The server's copy is
 * `server/src/utils/workOrders.ts`; the labels here must read the same.
 */

export const WORK_ORDER_STATUS_OPTIONS: { value: WorkOrderStatus; label: string; hint: string }[] = [
  { value: "requested", label: "Requested", hint: "The owner asked for the work. No day agreed yet." },
  { value: "scheduled", label: "Scheduled", hint: "A day is agreed for it to come in. Not here yet." },
  { value: "received", label: "Aircraft received", hint: "It is in the hangar." },
  { value: "in_progress", label: "In progress", hint: "Inspection or work under way." },
  { value: "waiting_owner", label: "Waiting for owner", hint: "Something needs the owner's answer." },
  { value: "waiting_parts", label: "Waiting for parts", hint: "Held up by a part on order." },
  { value: "ready", label: "Ready for pickup", hint: "Done and waiting to be collected." },
  { value: "completed", label: "Completed", hint: "Handed back. Moves to Finished jobs." },
  { value: "cancelled", label: "Cancelled", hint: "Not going ahead. Moves to Finished jobs." },
];

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = Object.fromEntries(
  WORK_ORDER_STATUS_OPTIONS.map((o) => [o.value, o.label])
) as Record<WorkOrderStatus, string>;

/** The aircraft is physically at the shop for this job. */
export const IN_SHOP_STATUSES: readonly WorkOrderStatus[] = ["received", "in_progress", "waiting_owner", "waiting_parts", "ready"];

export const isOpenWorkOrder = (w: Pick<WorkOrder, "status">) => w.status !== "completed" && w.status !== "cancelled";

export type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

/** One colour per stage: waiting on somebody is amber, ready is green, closed is quiet. */
export function workOrderStatusVariant(status: WorkOrderStatus): BadgeVariant {
  switch (status) {
    case "waiting_owner":
    case "waiting_parts":
      return "warning";
    case "ready":
    case "completed":
      return "success";
    case "cancelled":
      return "outline";
    case "requested":
    case "scheduled":
      return "secondary";
    default:
      return "default";
  }
}

/** Tenths of an hour, as shown: 12345 is "1234.5". */
export function tenthsLabel(tenths: number | null | undefined): string {
  return tenths == null ? "" : (tenths / 10).toFixed(1);
}

/** "1234.5" (or "1234") typed by a person to tenths, or null when blank; undefined when not a reading. */
export function parseTenths(text: string): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d{1,5}(\.\d)?$/.test(t)) return undefined;
  return Math.round(Number(t) * 10);
}

/** The aircraft's name on a job: its tail, or its make and model if it has none. */
export function workOrderAircraftName(w: Pick<WorkOrder, "aircraft">): string {
  return w.aircraft.tailNumber ?? ([w.aircraft.make, w.aircraft.model].filter(Boolean).join(" ") || `Aircraft #${w.aircraft.id}`);
}
