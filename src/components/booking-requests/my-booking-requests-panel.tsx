import { format, formatDistanceToNowStrict } from "date-fns";
import { ClipboardList } from "lucide-react";
import { useCancelBookingRequest, useMyBookingRequests } from "@/features/booking-requests";
import type { BookingRequest } from "@/types/booking-requests";
import { resourceLabel, type Resource } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/states";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

export function MyBookingRequestsPanel() {
  const requestsQuery = useMyBookingRequests();
  const cancel = useCancelBookingRequest();

  const cancelRequest = async (request: BookingRequest) => {
    try {
      await cancel.mutateAsync({ id: request.id });
      toast.success("Request cancelled");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not cancel this request");
    }
  };

  const requests = requestsQuery.data ?? [];

  if (requestsQuery.isPending) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Loading requests...</p>;
  }
  if (requestsQuery.isError) {
    return <ErrorState error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} />;
  }
  if (requests.length === 0) {
    return (
      <div className="py-8 text-center">
        <ClipboardList className="mx-auto size-8 text-muted-foreground/60" />
        <p className="mt-3 font-medium">No booking requests</p>
        <p className="mt-1 text-sm text-muted-foreground">
          When your school requires approval, submitted requests show up here until the desk decides.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border">
      {requests.map((request) => (
        <li key={request.id} className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium capitalize">{request.reservationType}</p>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-muted-foreground">{formatWindow(request)}</p>
          <p className="text-xs text-muted-foreground">
            Submitted {formatDistanceToNowStrict(new Date(request.createdAt))} ago
          </p>
          {request.decisionReason ? (
            <p className="text-sm text-muted-foreground">{request.decisionReason}</p>
          ) : null}
          {request.status === "pending" ? (
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={cancel.isPending}
              onClick={() => void cancelRequest(request)}
            >
              Cancel request
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: BookingRequest["status"] }) {
  const variant =
    status === "approved" ? "default" : status === "pending" ? "secondary" : "outline";
  return <Badge variant={variant}>{status}</Badge>;
}

function formatWindow(request: BookingRequest): string {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(request.start));
  const start = format(new Date(request.start), "h:mm a");
  const end = format(new Date(request.end), "h:mm a");
  const resource = request.resource
    ? `${resourceLabel(request.resource as Resource).name} · `
    : "";
  return `${resource}${date} · ${start} - ${end}`;
}
