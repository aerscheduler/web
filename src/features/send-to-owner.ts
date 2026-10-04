import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Sent = { sent: number; reached: string[]; notReached: { name: string; reason: string }[] };

/**
 * Send a job's findings not yet sent to the aircraft's owners, and say who it reached. One path
 * for the job page's Send to owner button and the "Notify owner" on the toast after a finding is
 * added, so both report the same way. Takes the query client rather than a mutation hook because
 * the toast outlives the dialog that raised it.
 */
export async function sendFindingsToOwner(qc: QueryClient, workOrderId: number): Promise<Sent | null> {
  try {
    const r = await api<Sent>(`/work-orders/${workOrderId}/send-to-owner`, { method: "POST" });
    toast.success(`Sent to ${r.reached.join(" and ")}`);
    if (r.notReached.length) toast.warning(r.notReached.map((n) => `${n.name} ${n.reason}`).join(". "));
    return r;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't send to the owner";
    // Pressed twice (the button, then an older toast's Notify owner): already done, not a failure.
    if (/^Nothing new to send/.test(message)) toast.info("Already sent to the owner. Nothing new to send.");
    else toast.error(message);
    return null;
  } finally {
    void qc.invalidateQueries({ queryKey: ["workOrders"] });
  }
}
