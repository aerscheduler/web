import { Link } from "@tanstack/react-router";
import { Bell, BellOff, CalendarDays, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLeaveConversation, useMuteConversation } from "@/features/messages";
import type { ConversationSummary } from "@/types/messages";
import { ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * A conversation row's right-click menu, in the dock list and the expanded list: the same
 * actions as the info popover under a conversation's name (Profile or Booking, Mute, Leave).
 * Links navigate like any link in Messages (the expanded view shrinks back to the dock).
 */
export function ConversationMenuItems({ c, me, onLeft }: { c: ConversationSummary; me: number | null; onLeft?: () => void }) {
  const mute = useMuteConversation(c.id);
  const leave = useLeaveConversation();
  const confirm = useConfirm();
  const other = c.kind === "direct" ? c.participants.find((p) => p.orgUserId !== me) : null;

  const onLeave = async () => {
    const ok = await confirm({
      title: c.kind === "group" ? "Leave this group?" : "Leave this conversation?",
      description: "You stop receiving its messages. Somebody in it can add you back.",
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    leave.mutate(c.id, { onSuccess: () => onLeft?.(), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't leave.") });
  };

  return (
    <>
      {other && (
        <ContextMenuItem asChild>
          <Link to="/people/$orgUserId" params={{ orgUserId: String(other.orgUserId) }}>
            <UserRound /> Profile
          </Link>
        </ContextMenuItem>
      )}
      {c.reservation && (
        <ContextMenuItem asChild>
          <Link to="/schedule/reservations/$reservationId" params={{ reservationId: String(c.reservation.id) }}>
            <CalendarDays /> Booking
          </Link>
        </ContextMenuItem>
      )}
      {c.isParticipant && (
        <>
          {(other || c.reservation) && <ContextMenuSeparator />}
          <ContextMenuItem onSelect={() => mute.mutate(!c.muted)}>
            {c.muted ? <Bell /> : <BellOff />} {c.muted ? "Unmute" : "Mute"}
          </ContextMenuItem>
          {c.kind !== "direct" && (
            <ContextMenuItem onSelect={() => void onLeave()}>
              <LogOut /> {c.kind === "group" ? "Leave group" : "Leave conversation"}
            </ContextMenuItem>
          )}
        </>
      )}
    </>
  );
}
