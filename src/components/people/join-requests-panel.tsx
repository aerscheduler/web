import * as React from "react";
import { toast } from "sonner";
import { Check, UserPlus, X } from "lucide-react";
import {
  pageRows,
  useAcceptJoinRequest,
  useMembershipPlanOptions,
  useDeclineJoinRequest,
  useJoinRequestsPage,
} from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
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
import { planPriceLine } from "@/lib/membership";

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
  const paging = usePaging();
  const q = useJoinRequestsPage(paging);
  const { rows: requests, total } = pageRows(q);

  // The count in the heading is the whole queue, not the page, an admin
  // needs to know there are 40 people waiting, not that 25 fit on screen.
  if (q.isLoading || total === 0) return null;

  return (
    <Card className="mb-4 overflow-hidden border-[color-mix(in_oklch,var(--warning)_35%,transparent)]">
      <div className="flex items-center gap-2 border-b bg-[color-mix(in_oklch,var(--warning)_8%,transparent)] px-4 py-2.5">
        <UserPlus className="size-4 text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]" />
        <h2 className="text-sm font-semibold">
          Join requests
          <span className="ml-1.5 text-muted-foreground">({total.toLocaleString()})</span>
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {requests.map((r) => (
          <JoinRequestRow key={r.id} request={r} />
        ))}
      </ul>
      <TablePagination
        paging={paging}
        total={total}
        returned={requests.length}
        loading={q.isFetching}
        className="px-4 pb-3"
      />
    </Card>
  );
}

function JoinRequestRow({ request }: { request: JoinRequest }) {
  const accept = useAcceptJoinRequest();
  const decline = useDeclineJoinRequest();
  const [roleValue, setRoleValue] = React.useState("student");
  //Only offered when the school actually has plans, so the row stays two controls wide at
  //every school that does not run memberships.
  const plans = useMembershipPlanOptions();
  const [planValue, setPlanValue] = React.useState("none");
  const busy = accept.isPending || decline.isPending;

  async function onAccept() {
    const role = ROLE_OPTIONS.find((o) => o.value === roleValue)?.role;
    try {
      await accept.mutateAsync({
        id: request.id,
        role,
        membershipPlanId: planValue === "none" ? undefined : Number(planValue),
      });
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
        {(plans.data?.length ?? 0) > 0 && (
          <Select value={planValue} onValueChange={setPlanValue} disabled={busy}>
            <SelectTrigger className="w-44" aria-label="Membership plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No membership</SelectItem>
              {(plans.data ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}, {planPriceLine(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
