import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, MoreHorizontal, Shield, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { OrganizationUser } from "@/types/api";
import { useUpdateMemberOrgUser } from "@/features/queries";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canManageMembers } from "@/lib/permissions";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GroundMemberModal } from "./ground-member-modal";
import { memberName } from "./util";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

export function MemberRowActions({
  ou,
  onView,
  onEditRoles,
  align = "end",
}: {
  ou: OrganizationUser;
  onView: (ou: OrganizationUser) => void;
  onEditRoles: (ou: OrganizationUser) => void;
  align?: "end" | "start";
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { roles } = useAuth();
  // Use the nested user's id, not FK_userId — the server strips every FK_* field
  // from responses, so ou.FK_userId is always undefined (which would PATCH/POST
  // to `.../undefined`). The /orgUsers list includes `user.id`.
  const targetUserId = ou.user?.id ?? ou.FK_userId ?? 0;
  const orgUserMut = useUpdateMemberOrgUser(targetUserId);
  const name = memberName(ou);
  const [groundOpen, setGroundOpen] = useState(false);

  /**
   * Grounding opens a modal, because the reason is mandatory — the member is
   * emailed it verbatim. Ungrounding stays inline but now confirms: it used to
   * fire on a single click with no prompt, so a misclick silently reinstated
   * someone. It also clears the stale reason rather than leaving the old one
   * hanging off an active member.
   */
  async function unground() {
    const ok = await confirm({
      title: `Reinstate ${name}?`,
      description: "They'll be able to book and fly again right away.",
      confirmLabel: "Reinstate member",
    });
    if (!ok) return;
    orgUserMut.mutate(
      // Empty string, NOT null: the server does `params.groundedReason ?? undefined`,
      // so null collapses to undefined and Prisma skips the column — the old reason
      // would survive on a now-active member. "" actually writes. (Verified against
      // the API; the Flutter unground path sends "" for the same reason.)
      { grounded: false, groundedReason: "" },
      {
        onSuccess: () => toast.success(`${name} is active again.`),
        onError: (e) => toast.error(errMessage(e, "Couldn't update this member.")),
      }
    );
  }

  async function remove() {
    const ok = await confirm({
      title: `Remove ${name}?`,
      description:
        "This removes them from your organization. Their flight and billing history is preserved.",
      confirmLabel: "Remove member",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/organizations/removeUser/${targetUserId}`, { method: "POST" });
      void qc.invalidateQueries({ queryKey: ["members"] });
      void qc.invalidateQueries({ queryKey: ["users"] });
      toast.success(`${name} removed.`);
    } catch (e) {
      toast.error(errMessage(e, "Couldn't remove this member."));
    }
  }

  return (
    <>
      <GroundMemberModal open={groundOpen} onOpenChange={setGroundOpen} member={ou} />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Actions</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align={align} className="w-48">
          <DropdownMenuItem onSelect={() => onView(ou)}>
            <Eye /> View profile
          </DropdownMenuItem>
          {canManageMembers(roles) && (
          <>
              <DropdownMenuItem onSelect={() => onEditRoles(ou)}>
                <Shield /> Edit roles
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => (ou.grounded ? void unground() : setGroundOpen(true))}
              >
                {ou.grounded ? (
                <>
                    <Undo2 /> Unground
                </>
                ) : (
                <>
                    <Ban /> Ground
                </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                <Trash2 /> Remove
              </DropdownMenuItem>
          </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
