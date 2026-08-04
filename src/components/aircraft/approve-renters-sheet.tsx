import * as React from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
import {
  useApproveResource,
  useMembers,
  useResourceApprovedPilots,
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
 * The server has no "who is approved on this tail" read, so the current state is
 * inverted from each renter's own approved list (`useResourceApprovedPilots`).
 * That matters: this sheet used to open with every switch OFF regardless of the
 * truth, so an already-approved renter looked unapproved, and toggling them on
 * and off again to check would actually revoke them.
 *
 * Local overrides still win while the sheet is open, so a flip is instant rather
 * than waiting on a refetch of every renter.
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
  const q = useMembers({ renter: true }, { enabled: open });
  const approvedQ = useResourceApprovedPilots(resource?.id ?? null, { enabled: open });
  const approve = useApproveResource(resource?.id ?? 0);
  const renters = q.data ?? [];

  const approvedIds = React.useMemo(
    () => new Set((approvedQ.data ?? []).map((m) => m.id)),
    [approvedQ.data]
  );

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
                const isOn = approved[m.id] ?? approvedIds.has(m.id);
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
