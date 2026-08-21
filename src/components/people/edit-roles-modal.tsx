import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { OrganizationUser, RolesUpdate } from "@/types/api";
import { useUpdateRoles } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ROLE_OPTIONS, memberName, rolesUpdateFrom, type RoleKey } from "./util";

const EMPTY: RolesUpdate = {
  owner: false,
  admin: false,
  instructor: false,
  student: false,
  renter: false,
  dispatcher: false,
  technician: false,
};

export function EditRolesModal({
  member,
  open,
  onOpenChange,
}: {
  member: OrganizationUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [roles, setRoles] = useState<RolesUpdate>(EMPTY);
  // The member's USER id, from the nested relation, see the note in types/api.ts.
  const mut = useUpdateRoles(member?.user?.id ?? 0);

  useEffect(() => {
    if (member) setRoles(rolesUpdateFrom(member));
  }, [member]);

  function toggle(key: RoleKey, checked: boolean) {
    setRoles((prev) => {
      const next: RolesUpdate = { ...prev, [key]: checked };
      // Owner implies admin (backend rejects owner without admin).
      if (key === "owner" && checked) next.admin = true;
      if (key === "admin" && !checked && prev.owner) next.admin = true;
      return next;
    });
  }

  function submit() {
    if (!member) return;
    mut.mutate(roles, {
      onSuccess: () => {
        toast.success(`Roles updated for ${memberName(member)}.`);
        onOpenChange(false);
      },
      onError: (e) =>
        toast.error(
          e instanceof ApiError || e instanceof Error
            ? e.message || "Couldn't update roles."
            : "Couldn't update roles."
        ),
    });
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={mut.isPending}>
              {mut.isPending ? "Saving…" : "Save roles"}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title="Edit roles"
      description={
        member ? `Choose what ${memberName(member)} can do in your organization.` : undefined
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLE_OPTIONS.map((r) => {
            const id = `role-${r.key}`;
            const checked = roles[r.key];
            const locked = r.key === "admin" && roles.owner;
            return (
              <label
                key={r.key}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  checked
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/40",
                  locked && "cursor-not-allowed opacity-80"
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={locked}
                  onCheckedChange={(v) => toggle(r.key, v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.label}</span>
                  {r.hint && (
                    <span className="block text-xs text-muted-foreground">{r.hint}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </ResponsiveModal>
  );
}
