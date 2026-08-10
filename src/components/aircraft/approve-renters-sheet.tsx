import * as React from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  useApproveResource,
  useMembers,
} from "@/features/queries";
import type { OrganizationUser, Resource } from "@/types/api";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { initials } from "@/lib/utils";

/**
 * Toggle which renters may book a given aircraft.
 *
 * Each switch's true position rides along on the roster row itself, via
 * `approvedForResourceId`. Getting this right matters twice over: the sheet once
 * opened with every switch OFF regardless of the truth, so an already-approved
 * renter looked unapproved and toggling them to check would actually revoke
 * them, and the fix that followed asked each renter in turn, which meant a
 * school past the first 60 renters saw the same wrong OFF further down the list.
 *
 * Local overrides still win while the sheet is open, so a flip is instant rather
 * than waiting on a refetch.
 */
export function ApproveRentersSheet({
  open,
  onOpenChange,
  resource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: Resource | null;
}) {
  const q = useMembers(
    { renter: true, ...(resource ? { approvedForResourceId: resource.id } : {}) },
    { enabled: open && resource != null }
  );
  const approve = useApproveResource(resource?.id ?? 0);
  const renters = q.data ?? [];

  // Only what this sheet has changed since it opened; everything else reads
  // through to the server's answer above.
  const [approved, setApproved] = React.useState<Record<number, boolean>>({});
  React.useEffect(() => {
    if (open) setApproved({});
  }, [open, resource?.id]);

  const tail = resource?.type?.plane?.tailNumber ?? "aircraft";

  function toggle(m: OrganizationUser, next: boolean) {
    const userId = m.user?.id ?? 0;
    setApproved((prev) => ({ ...prev, [m.id]: next }));
    approve.mutate(
      { userId, approve: next },
      {
        onSuccess: () =>
          toast.success(
            `${m.user?.name ?? "Renter"} ${next ? "approved for" : "removed from"} ${tail}`
          ),
        onError: (err) => {
          setApproved((prev) => ({ ...prev, [m.id]: !next }));
          toast.error(err instanceof Error ? err.message : "Couldn't update approval");
        },
      }
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Approve renters · {tail}</SheetTitle>
          <SheetDescription>
            Choose which renters are checked out to book this aircraft.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {q.isPending ? (
            <TableSkeleton rows={6} cols={2} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : renters.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No renters yet"
              body="Invite renters and give them the renter role to approve them on aircraft."
            />
          ) : (
            <ul className="divide-y divide-border">
              {renters.map((m) => {
                const name = m.user?.name ?? `Member #${m.id}`;
                const isOn = approved[m.id] ?? m.approvedForResource === true;
                return (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Avatar className="size-9">
                      {m.profileImage && <AvatarImage src={m.profileImage} alt={name} />}
                      <AvatarFallback>{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{name}</div>
                      {m.user?.email && (
                        <div className="truncate text-xs text-muted-foreground">
                          {m.user.email}
                        </div>
                      )}
                    </div>
                    <Label htmlFor={`approve-${m.id}`} className="sr-only">
                      Approve {name} for {tail}
                    </Label>
                    <Switch
                      id={`approve-${m.id}`}
                      checked={isOn}
                      onCheckedChange={(v) => toggle(m, v)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
