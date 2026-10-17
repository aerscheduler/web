import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, CalendarDays, LogOut, UserRound, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConversationMessages, threadMessages, useLeaveConversation, useMuteConversation } from "@/features/messages";
import type { ConversationSummary, MessageRef } from "@/types/messages";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { useConfirm } from "@/components/confirm-dialog";
import { refLink } from "@/components/messages/message-body";
import { SEARCH_TYPE_ICON } from "@/lib/search-links";

const ROLE_WORD: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  instructor: "Instructor",
  student: "Student",
  renter: "Renter",
  technician: "Technician",
};

const REF_ICON = {
  person: SEARCH_TYPE_ICON.person,
  resource: SEARCH_TYPE_ICON.resource,
  reservation: SEARCH_TYPE_ICON.reservation,
  workOrder: SEARCH_TYPE_ICON.workorder,
  squawk: SEARCH_TYPE_ICON.squawk,
} as const;

/**
 * A conversation's info, as a popover under its name (the info panel in Apple's Messages):
 * who it is with at the top, a row of actions, then the people and the records mentioned.
 * No dialog and no tabs; it closes when you click away.
 *
 * `anchor` is the header's name button. Pass `open`/`onOpenChange` so the faces button can
 * open the same popover.
 */
export function ConversationInfo({
  c,
  me,
  open,
  onOpenChange,
  onLeft,
  children,
}: {
  c: ConversationSummary;
  me: number | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onLeft?: () => void;
  /** The element the popover hangs under (the header's name). */
  children: React.ReactNode;
}) {
  const q = useConversationMessages(open ? c.id : null);
  const mute = useMuteConversation(c.id);
  const leave = useLeaveConversation();
  const confirm = useConfirm();
  const others = c.participants.filter((p) => p.orgUserId !== me);
  const other = c.kind === "direct" ? others[0] : null;

  const mentioned = React.useMemo(() => {
    const { messages } = threadMessages(q.data);
    const seen = new Map<string, MessageRef>();
    for (let i = messages.length - 1; i >= 0; i--) {
      for (const [key, ref] of Object.entries(messages[i]!.refs)) {
        if (ref.type !== "person" && !seen.has(key)) seen.set(key, ref);
      }
    }
    return [...seen.values()];
  }, [q.data]);

  const onLeave = async () => {
    onOpenChange(false);
    const ok = await confirm({
      title: c.kind === "group" ? "Leave this group?" : "Leave this conversation?",
      description: "You stop receiving its messages. Somebody in it can add you back.",
      confirmLabel: "Leave",
      destructive: true,
    });
    if (!ok) return;
    leave.mutate(c.id, { onSuccess: () => onLeft?.(), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't leave.") });
  };

  const subtitle =
    c.kind === "direct"
      ? other?.roles.map((r) => ROLE_WORD[r] ?? r).join(", ") || "Member"
      : c.kind === "group"
        ? `${c.participants.length} people`
        : "Everyone on this booking and your organization's staff can read this";

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent align="start" sideOffset={8} className="w-[320px] p-0">
        {/* Who it is with. */}
        <div className="flex flex-col items-center gap-2 px-5 pb-4 pt-5 text-center">
          {c.kind === "direct" ? (
            <PersonAvatar name={other?.name ?? c.title} image={other?.profileImage} size="lg" className="size-14" />
          ) : (
            <span className="flex">
              {c.participants.slice(0, 3).map((p, i) => (
                <PersonAvatar key={p.orgUserId} name={p.name} image={p.profileImage} size="lg" className={cn("ring-2 ring-popover", i > 0 && "-ml-3")} />
              ))}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{c.title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {/* What you can do, as a row of buttons. */}
        <div className="flex justify-center gap-2 px-4 pb-4">
          {other && (
            <ActionLink icon={UserRound} label="Profile" to="/people/$orgUserId" params={{ orgUserId: String(other.orgUserId) }} onDone={() => onOpenChange(false)} />
          )}
          {c.reservation && (
            <ActionLink
              icon={CalendarDays}
              label="Booking"
              to="/schedule/reservations/$reservationId"
              params={{ reservationId: String(c.reservation.id) }}
              onDone={() => onOpenChange(false)}
            />
          )}
          {c.isParticipant && (
            <ActionButton icon={c.muted ? Bell : BellOff} label={c.muted ? "Unmute" : "Mute"} pressed={c.muted} onClick={() => mute.mutate(!c.muted)} />
          )}
          {c.isParticipant && c.kind !== "direct" && <ActionButton icon={LogOut} label="Leave" onClick={onLeave} />}
        </div>

        {c.kind !== "direct" && (
          <Section title={`People · ${c.participants.length}`}>
            <ul className="max-h-48 overflow-y-auto">
              {c.participants.map((p) => (
                <li key={p.orgUserId}>
                  <Link
                    to="/people/$orgUserId"
                    params={{ orgUserId: String(p.orgUserId) }}
                    onClick={() => onOpenChange(false)}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
                  >
                    <PersonAvatar name={p.name} image={p.profileImage} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.orgUserId === me ? `${p.name} (you)` : p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.roles.map((r) => ROLE_WORD[r] ?? r)[0] ?? ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {mentioned.length > 0 && (
          <Section title="Mentioned">
            <ul className="max-h-40 overflow-y-auto">
              {mentioned.map((ref) => {
                const Icon = REF_ICON[ref.type];
                const link = refLink(ref);
                const row = (
                  <>
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className={cn("truncate text-sm", !link && "text-muted-foreground")}>{ref.label}</span>
                  </>
                );
                return (
                  <li key={`${ref.type}-${ref.id}`}>
                    {link ? (
                      <Link
                        to={link.to as never}
                        params={link.params as never}
                        onClick={() => onOpenChange(false)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent"
                      >
                        {row}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2.5 px-2 py-1.5">{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t px-2 pb-2 pt-2.5">
      <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

const ACTION = "flex w-[68px] flex-col items-center gap-1 rounded-lg bg-muted px-2 py-2 text-[11px] font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ActionButton({ icon: Icon, label, onClick, pressed }: { icon: LucideIcon; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className={ACTION}>
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

function ActionLink({ icon: Icon, label, to, params, onDone }: { icon: LucideIcon; label: string; to: string; params: Record<string, string>; onDone: () => void }) {
  return (
    <Link to={to as never} params={params as never} onClick={onDone} className={ACTION}>
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  );
}
