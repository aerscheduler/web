import * as React from "react";
import { toast } from "sonner";
import { Search, Users } from "lucide-react";
import {
  useApproveResource,
  useMembers,
} from "@/features/queries";
import { rolesOf, type OrganizationUser, type Resource } from "@/types/api";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/states";
import { DocsHint } from "@/components/docs-hint";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
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

function flyingRoleLabel(m: OrganizationUser): string {
  const roles = rolesOf(m);
  const parts = [
    roles.includes("student") ? "Student" : null,
    roles.includes("renter") ? "Renter" : null,
  ].filter(Boolean);
  return parts.join(", ");
}

/**
 * Toggle which students and renters may book a given aircraft.
 *
 * The booking-preferences gate holds those two roles to the approved list.
 * Instructors, admins and dispatchers are never checked, so they are not in
 * this sheet. Each switch's true position rides along on the roster row itself,
 * via `approvedForResourceId`.
 *
 * Local overrides still win while the sheet is open, so a flip is instant
 * rather than waiting on a refetch.
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
    {
      student: true,
      renter: true,
      ...(resource ? { approvedForResourceId: resource.id } : {}),
    },
    { enabled: open && resource != null }
  );
  const approve = useApproveResource();
  const members = q.data ?? [];

  const [query, setQuery] = React.useState("");
  const [approved, setApproved] = React.useState<Record<number, boolean>>({});
  React.useEffect(() => {
    if (open) {
      setApproved({});
      setQuery("");
    }
  }, [open, resource?.id]);

  const tail =
    resource?.type?.plane?.tailNumber ??
    resource?.type?.simulator?.name ??
    "this resource";

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? members.filter((m) => {
        const name = m.user?.name ?? "";
        const email = m.user?.email ?? "";
        return name.toLowerCase().includes(needle) || email.toLowerCase().includes(needle);
      })
    : members;

  function toggle(m: OrganizationUser, next: boolean) {
    const userId = m.user?.id ?? 0;
    const resourceId = resource?.id ?? 0;
    setApproved((prev) => ({ ...prev, [m.id]: next }));
    approve.mutate(
      { resourceId, userId, approve: next },
      {
        onSuccess: () =>
          toast.success(
            `${m.user?.name ?? "Member"} ${next ? "approved for" : "removed from"} ${tail}`
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
          <div className="flex items-center gap-1.5">
            <SheetTitle>Approve members · {tail}</SheetTitle>
            <DocsHint topic="approve-members" />
          </div>
          <SheetDescription>
            Students and renters checked out to book this aircraft. Instructors
            are not restricted. Each switch saves immediately.
          </SheetDescription>
        </SheetHeader>

        {members.length > 8 && (
          <div className="px-4 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                className="pl-8"
                aria-label="Search members"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-5">
          {q.isPending ? (
            <TableSkeleton rows={6} cols={2} />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No students or renters yet"
              body="Give someone the student or renter role from People, then approve them here. Instructors can already book any tail."
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matches"
              body="Nobody in this list matches that name or email."
            />
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((m) => {
                const name = m.user?.name ?? `Member #${m.id}`;
                const isOn = approved[m.id] ?? m.approvedForResource === true;
                const role = flyingRoleLabel(m);
                return (
                  <li key={m.id} className="flex items-center gap-3 py-3">
                    <Avatar className="size-9">
                      {m.profileImage && <AvatarImage src={m.profileImage} alt={name} />}
                      <AvatarFallback>{initials(name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {role}
                        {role && m.user?.email ? " · " : ""}
                        {m.user?.email}
                      </div>
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
