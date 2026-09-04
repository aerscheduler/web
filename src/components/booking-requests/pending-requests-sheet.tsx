import { format, formatDistanceToNowStrict } from "date-fns";
import { ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import {
  useApproveBookingRequest,
  usePendingBookingRequests,
  useRejectBookingRequest,
} from "@/features/booking-requests";
import { ApiError } from "@/lib/api";
import type { BookingRequest } from "@/types/booking-requests";
import { resourceLabel, type Resource } from "@/types/api";
import { DetailPanel } from "@/components/detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";

export function PendingBookingRequestsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const requestsQuery = usePendingBookingRequests(open);
  const approve = useApproveBookingRequest();
  const reject = useRejectBookingRequest();

  const act = async (action: "approve" | "reject", request: BookingRequest) => {
    try {
      if (action === "approve") {
        await approve.mutateAsync({ id: request.id });
        toast.success("Request approved and booked");
      } else {
        await reject.mutateAsync({ id: request.id });
        toast.success("Request declined");
      }
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update this request");
    }
  };

  const requests = requestsQuery.data ?? [];

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Booking requests"
      description="Pending member requests waiting for desk approval. Approving creates a normal reservation."
    >
      {requestsQuery.isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading requests...</p>
      ) : requestsQuery.isError ? (
        <ErrorState error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} />
      ) : requests.length === 0 ? (
        <div className="py-8 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">No pending requests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When members need approval to book, their requests appear here.
          </p>
        </div>
      ) : (
        <ul className="-mx-4 divide-y divide-border border-t">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-3 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">
                    {request.requestedBy?.user?.name ?? `Member #${request.requestedBy?.id}`}
                  </p>
                  <Badge variant="outline">{request.reservationType}</Badge>
                  <Badge variant="secondary">Pending</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {request.resource
                    ? `${resourceLabel(request.resource as Resource).name} · `
                    : ""}
                  {formatWindow(request)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Submitted {formatDistanceToNowStrict(new Date(request.createdAt))} ago
                </p>
                {request.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">{request.notes}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => void act("approve", request)}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={approve.isPending || reject.isPending}
                  onClick={() => void act("reject", request)}
                >
                  <X className="size-4" /> Decline
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </DetailPanel>
  );
}

function formatWindow(request: BookingRequest): string {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(request.start));
  const start = format(new Date(request.start), "h:mm a");
  const end = format(new Date(request.end), "h:mm a");
  return `${date} · ${start} - ${end}`;
}
