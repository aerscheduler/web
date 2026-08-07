import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Ban, Eye, MoreHorizontal, Shield, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import type { OrganizationUser } from "@/types/api";
import { useSetMemberArchived, useUpdateMemberOrgUser } from "@/features/queries";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canGroundMembers, canManageMembers } from "@/lib/permissions";
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
  onRemoved,
  align = "end",
}: {
  ou: OrganizationUser;
  /** Omitted on the profile page itself — "View profile" would go nowhere. */
  onView?: (ou: OrganizationUser) => void;
  onEditRoles: (ou: OrganizationUser) => void;
  /**
   * Called after a successful removal. On the roster the row just disappears, so
   * there is nothing to do; on that member's own page the record you are looking
   * at has ceased to exist, and without this you sit on a page that refetches
   * into "Member not found".
   */
  onRemoved?: () => void;
  align?: "end" | "start";
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { roles } = useAuth();
  // The member's USER id, from the nested relation — see the note in types/api.ts.
  // The /orgUsers list includes `user.id`.
  const targetUserId = ou.user?.id ?? 0;
  const orgUserMut = useUpdateMemberOrgUser(targetUserId);
  const archiveMut = useSetMemberArchived(targetUserId);
  const name = memberName(ou);
  const [groundOpen, setGroundOpen] = useState(false);
  const archived = !!ou.archivedAt;

  /**
   * Two permissions, not one, and they are deliberately different sets.
   *
   * `manage` (owner/admin) covers the roster: roles, archiving, removal.
   * `ground` also includes the DISPATCHER, matching the server's own split (grounding is
   * `PATCH /users/:id/orgUser`, admin or dispatcher; archiving is its own admin-only
   * route) and matching the app, which has offered a dispatcher ground/unground all
   * along. Gating this whole menu on `manage` is what forced a front desk running the
   * console to hold the admin role or pick up a phone.
   */
  const manage = canManageMembers(roles);
  const ground = canGroundMembers(roles);

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

  /**
   * Retiring somebody, and the reason this menu item exists at all.
   *
   * The only tool for tidying a roster used to be Ground, which emails the member. A
   * school working through two years of dormant students therefore sent 107 unexpected
   * "you have been grounded" notices in two hours. The confirm copy leads with the fact
   * that this one is silent, because that is the whole difference between the two.
   */
  async function toggleArchived() {
    const ok = await confirm(
      archived
        ? {
            title: `Bring ${name} back?`,
            description:
              "They'll reappear on the roster, can be booked again, and will start receiving notifications from you.",
            confirmLabel: "Return to roster",
          }
        : {
            title: `Archive ${name}?`,
            description:
              "They're not told, and they'll stop receiving any email or notification from you. They come off the roster and can't be booked, but their flights, invoices and history are all kept — and you can bring them back any time.",
            confirmLabel: "Archive member",
          }
    );
    if (!ok) return;
    archiveMut.mutate(!archived, {
      onSuccess: () =>
        toast.success(archived ? `${name} is back on the roster.` : `${name} archived.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't update this member.")),
    });
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
      onRemoved?.();
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
          {onView && (
            <DropdownMenuItem onSelect={() => onView(ou)}>
              <Eye /> View profile
            </DropdownMenuItem>
          )}
          {manage && (
            <DropdownMenuItem onSelect={() => onEditRoles(ou)}>
              <Shield /> Edit roles
            </DropdownMenuItem>
          )}
          {/* Grounding an archived member would email somebody the school has
              already retired: the exact thing archiving exists to prevent. */}
          {ground && !archived && (
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
          )}
          {manage && (
            <>
              <DropdownMenuItem onSelect={() => void toggleArchived()}>
                {archived ? (
                  <>
                    <ArchiveRestore /> Return to roster
                  </>
                ) : (
                  <>
                    <Archive /> Archive
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
