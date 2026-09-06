import { format, formatDistanceToNowStrict } from "date-fns";
import { ClipboardList, X } from "lucide-react";
import { toast } from "sonner";
import {
  useApproveBookingRequest,
  useConvertBookingRequest,
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
  const convert = useConvertBookingRequest();

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

  const invite = async (request: BookingRequest, role: "student" | "renter") => {
    try {
      await convert.mutateAsync({ id: request.id, role });
      toast.success(role === "student" ? "Invitation sent as student" : "Invitation sent as renter");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not invite this guest");
    }
  };

  const rows = requestsQuery.data ?? [];
  const pending = rows.filter((request) => request.status === "pending");
  const conversions = rows.filter(
    (request) =>
      request.status === "approved" &&
      request.source === "public_embed" &&
      !request.convertedAt &&
      !!request.guestEmail
  );
  const empty = pending.length === 0 && conversions.length === 0;
  const busy = approve.isPending || reject.isPending || convert.isPending;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title="Booking requests"
      description="Pending requests waiting for desk approval, including guest requests from a public booking link. Approving creates a normal reservation. Approved public guests can be invited as a student or renter."
    >
      {requestsQuery.isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading requests...</p>
      ) : requestsQuery.isError ? (
        <ErrorState error={requestsQuery.error} onRetry={() => void requestsQuery.refetch()} />
      ) : empty ? (
        <div className="py-8 text-center">
          <ClipboardList className="mx-auto size-8 text-muted-foreground/60" />
          <p className="mt-3 font-medium">No pending requests</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When members or guests need approval to book, their requests appear here.
          </p>
        </div>
      ) : (
        <div className="-mx-4 divide-y divide-border border-t">
          {pending.length > 0 ? (
            <ul className="divide-y divide-border">
              {pending.map((request) => (
                <li key={request.id} className="flex flex-col gap-3 px-4 py-3">
                  <RequestHeader request={request} badge="Pending" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void act("approve", request)}>
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void act("reject", request)}
                    >
                      <X className="size-4" /> Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {conversions.length > 0 ? (
            <ul className="divide-y divide-border">
              {conversions.map((request) => (
                <li key={`convert-${request.id}`} className="flex flex-col gap-3 px-4 py-3">
                  <RequestHeader request={request} badge="Approved" />
                  <p className="text-xs text-muted-foreground">
                    Invite {request.guestName ?? "this guest"} to join as a member. They keep the
                    booking that was already created.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void invite(request, "student")}
                    >
                      Invite as student
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void invite(request, "renter")}
                    >
                      Invite as renter
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </DetailPanel>
  );
}

function RequestHeader({ request, badge }: { request: BookingRequest; badge: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">
          {request.requestedBy?.user?.name ??
            request.guestName ??
            (request.requestedBy?.id ? `Member #${request.requestedBy.id}` : "Guest")}
        </p>
        <Badge variant="outline">{request.reservationType}</Badge>
        <Badge variant="secondary">{badge}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {request.resource ? `${resourceLabel(request.resource as Resource).name} · ` : ""}
        {formatWindow(request)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Submitted {formatDistanceToNowStrict(new Date(request.createdAt))} ago
      </p>
      {request.notes ? (
        <p className="mt-2 text-sm text-muted-foreground">{request.notes}</p>
      ) : null}
    </div>
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
