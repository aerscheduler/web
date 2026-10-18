import { Link } from "@tanstack/react-router";
import { Bell, Megaphone, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAnnouncements, useUnreadNotificationCount } from "@/features/queries";
import { useUnreadMessageCount } from "@/features/messages";
import { useMessagesDock } from "@/components/messages/messages-dock";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The top bar's bell: a menu of the three places things arrive (Announcements, Messages,
 * Notifications), the same three rows as the app's bell (app/lib/widgets/navigation/inbox_menu.dart).
 *
 * EACH ROW SAYS WHETHER IT IS THE ONE WITH SOMETHING IN IT. The bell carries a dot when any of
 * them has anything, and the dot is repeated beside whichever rows it came from, so the question
 * the menu answers is only which door to open. A dot, not a count: the number is on the page you
 * land on.
 *
 * An aircraft owner from outside the organization has no Announcements (the server refuses them
 * the list), so they get Messages and Notifications only.
 */
export function InboxMenu() {
  const { outsideOwner } = useAuth();
  const { openMessages } = useMessagesDock();
  const announcements = useAnnouncements({ enabled: !outsideOwner });
  const notifications = useUnreadNotificationCount();
  const messages = useUnreadMessageCount();

  const dots = {
    announcements: !outsideOwner && (announcements.data ?? []).some((a) => !a.seenAt),
    messages: (messages.data ?? 0) > 0,
    notifications: (notifications.data ?? 0) > 0,
  };
  const any = dots.announcements || dots.messages || dots.notifications;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={any ? "Inbox, something new" : "Inbox"} className="relative">
          <Bell className="size-4" />
          {any && <span className="absolute right-2 top-2 size-[7px] rounded-full bg-primary" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {!outsideOwner && (
          <DropdownMenuItem asChild>
            <Link to="/operations/announcements">
              <Megaphone />
              Announcements
              <Dot on={dots.announcements} />
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openMessages()}>
          <MessageCircle />
          Messages
          <Dot on={dots.messages} />
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/notifications">
            <Bell />
            Notifications
            <Dot on={dots.notifications} />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Dot({ on }: { on: boolean }) {
  return on ? <span className="ml-auto size-[7px] rounded-full bg-primary" aria-label="New" /> : null;
}
