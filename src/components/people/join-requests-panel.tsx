import * as React from "react";
import { toast } from "sonner";
import { Check, UserPlus, X } from "lucide-react";
import {
  useAcceptJoinRequest,
  useDeclineJoinRequest,
  useJoinRequests,
} from "@/features/queries";
import type { JoinRequest, Role } from "@/types/api";
import { ApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { initials } from "@/lib/utils";

const ROLE_OPTIONS: { value: string; label: string; role?: Role }[] = [
  { value: "student", label: "Student", role: "student" },
  { value: "renter", label: "Renter", role: "renter" },
  { value: "instructor", label: "Instructor", role: "instructor" },
  { value: "technician", label: "Technician", role: "technician" },
  { value: "dispatcher", label: "Dispatcher", role: "dispatcher" },
  { value: "admin", label: "Admin", role: "admin" },
  { value: "member", label: "No role yet" },
];

/**
 * Pending requests from people who entered the school's join code. Only rendered when there are
 * any; admins accept (assigning a starting role) or decline. Sits atop the People roster.
 */
export function JoinRequestsPanel() {
  const q = useJoinRequests();
  const requests = q.data ?? [];

  if (q.isLoading || requests.length === 0) return null;

  return (
    <Card className="mb-4 overflow-hidden border-[color-mix(in_oklch,var(--warning)_35%,transparent)]">
      <div className="flex items-center gap-2 border-b bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-4 py-2.5">
        <UserPlus className="size-4 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]" />
        <h2 className="text-sm font-semibold">
          Join requests
          <span className="ml-1.5 text-muted-foreground">({requests.length})</span>
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {requests.map((r) => (
          <JoinRequestRow key={r.id} request={r} />
        ))}
      </ul>
    </Card>
  );
}

function JoinRequestRow({ request }: { request: JoinRequest }) {
  const accept = useAcceptJoinRequest();
  const decline = useDeclineJoinRequest();
  const [roleValue, setRoleValue] = React.useState("student");
  const busy = accept.isPending || decline.isPending;

  async function onAccept() {
    const role = ROLE_OPTIONS.find((o) => o.value === roleValue)?.role;
    try {
      await accept.mutateAsync({ id: request.id, role });
      toast.success(`${request.user.name} added to the roster`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't accept the request");
    }
  }

  async function onDecline() {
    try {
      await decline.mutateAsync(request.id);
      toast.success("Request declined");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't decline the request");
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-9">
          <AvatarFallback>{initials(request.user.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate font-medium">{request.user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{request.user.email}</div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Select value={roleValue} onValueChange={setRoleValue} disabled={busy}>
          <SelectTrigger className="w-36" aria-label="Starting role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" onClick={onAccept} disabled={busy}>
          <Check className="size-4" /> Accept
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onDecline}
          disabled={busy}
          aria-label={`Decline ${request.user.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
