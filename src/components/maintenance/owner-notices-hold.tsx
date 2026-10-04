import { BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateWorkOrder } from "@/features/queries";
import { isOpenWorkOrder } from "@/lib/work-orders";
import type { WorkOrder } from "@/types/api";
import { Button } from "@/components/ui/button";

/** What the owner hears the moment the hold is lifted, from where the job stands. */
export function liftedNews(w: Pick<WorkOrder, "status" | "aircraft">): string | null {
  const tail = w.aircraft.tailNumber ?? "The aircraft";
  if (w.status === "scheduled") return `${tail} is booked in`;
  if (w.status === "ready") return `${tail} is ready for pickup`;
  if (w.status === "requested" || !isOpenWorkOrder(w)) return null;
  return `${tail} has arrived`;
}

/**
 * A job opened on hold (the one a shop opens while signing up) tells the owner nothing about its
 * stages until somebody chooses to. One quiet line on the job, and the button that lifts it.
 * Sending findings lifts it too, so this disappears on its own after a Send to owner.
 */
export function OwnerNoticesHold({ workOrder: w }: { workOrder: WorkOrder }) {
  const update = useUpdateWorkOrder();
  if (!w.holdOwnerNotices || w.aircraft.use !== "shop" || !isOpenWorkOrder(w)) return null;
  const who = w.billTo?.name ?? "The owner";
  const news = liftedNews(w);

  async function lift() {
    try {
      await update.mutateAsync({ id: w.id, holdOwnerNotices: false });
      toast.success(news ? `Owner told: ${news}.` : "The owner will hear when the job moves on.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't tell the owner");
    }
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
      role="status"
      data-testid="owner-notices-hold"
    >
      <BellOff className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1">
        {who} hasn't been emailed about this job.
        <span className="text-muted-foreground"> Nothing goes out until you say so.</span>
      </p>
      <Button size="sm" variant="secondary" onClick={() => void lift()} disabled={update.isPending}>
        {update.isPending && <Loader2 className="size-3.5 animate-spin" />}
        Tell the owner
      </Button>
    </div>
  );
}
