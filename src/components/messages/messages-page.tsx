import * as React from "react";
import { BellOff, CalendarDays, ChevronDown, MessagesSquare, SquarePen, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useConversation, useConversations } from "@/features/messages";
import type { ConversationSummary } from "@/types/messages";
import { ListSearch } from "@/components/list-search";
import { InboxPlaceholder, InboxView } from "@/components/inbox-view";
import { EmptyState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { Thread } from "@/components/messages/thread";
import { ComposeView } from "@/components/messages/compose-view";
import { ConversationInfo, ConversationPeople } from "@/components/messages/conversation-info";
import { ConversationMenuItems } from "@/components/messages/conversation-menu";

/** "9:41 AM" today, "Tue" this week, "Oct 3" before that: the list's right-hand time. */
function listTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 24 * 3600 * 1000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ROLE_WORD: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  dispatcher: "Dispatcher",
  instructor: "Instructor",
  student: "Student",
  renter: "Renter",
  technician: "Technician",
};

/** The line under a conversation's name: who they are, who is in it, or what booking. */
export function conversationSubtitle(c: ConversationSummary, me: number | null): string {
  if (c.kind === "direct") {
    const other = c.participants.find((p) => p.orgUserId !== me);
    return other?.roles.map((r) => ROLE_WORD[r] ?? r).join(", ") || "Member";
  }
  if (c.kind === "group") return `${c.participants.length} people`;
  if (c.reservation) {
    const start = new Date(c.reservation.start);
    return `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${c.reservation.cancelledAt ? " · Cancelled" : ""}`;
  }
  return "Booking";
}

export function ConversationGlyph({ c, me, size = "md" }: { c: ConversationSummary; me: number | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-10" : "size-9";
  if (c.kind === "direct") {
    const other = c.participants.find((p) => p.orgUserId !== me);
    return <PersonAvatar name={other?.name ?? c.title} image={other?.profileImage} size="lg" className={box} />;
  }
  const Icon = c.kind === "group" ? Users : CalendarDays;
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-muted text-muted-foreground", box, c.kind === "group" ? "rounded-full" : "rounded-lg")}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

export function ConversationRow({ c, me }: { c: ConversationSummary; me: number | null }) {
  const unread = c.unreadCount > 0;
  return (
    <div className="flex items-start gap-3">
      <ConversationGlyph c={c} me={me} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{c.title}</span>
          {c.muted && <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="Muted" />}
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{listTime(c.lastMessage?.createdAt ?? c.lastMessageAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <p className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {c.lastMessage
              ? `${c.lastMessage.authorName && c.kind !== "direct" ? `${c.lastMessage.authorName}: ` : c.lastMessage.authorName === "You" ? "You: " : ""}${c.lastMessage.preview}`
              : "No messages yet"}
          </p>
          {unread && (
            <span className="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {c.unreadCount > 99 ? "99+" : c.unreadCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The name at the top of a conversation. A click opens its info popover (people, mute, leave,
 * what was mentioned). The faces button beside it opens just the people, hung under itself.
 * Used on the full view and in the dock.
 */
export function ConversationTitle({
  c,
  me,
  onLeft,
  compact = false,
}: {
  c: ConversationSummary;
  me: number | null;
  onLeft?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const others = c.participants.filter((p) => p.orgUserId !== me);
  return (
    <>
      <ConversationInfo c={c} me={me} open={open} onOpenChange={setOpen} onLeft={onLeft} underHeader={compact}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1">
            <span className={cn("truncate font-semibold", compact ? "text-sm" : "text-[15px]")}>{c.title}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden />
            {c.muted && <BellOff className="size-3.5 shrink-0 text-muted-foreground" aria-label="Muted" />}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{conversationSubtitle(c, me)}</span>
        </button>
      </ConversationInfo>
      {!compact && c.kind !== "direct" && others.length > 0 && (
        <ConversationPeople c={c} me={me}>
          <MemberFaces people={c.participants} />
        </ConversationPeople>
      )}
    </>
  );
}

/** Up to three faces and the head count, like Slack's channel header. Opens the people popover. */
const MemberFaces = React.forwardRef<HTMLButtonElement, { people: ConversationSummary["participants"] } & React.ComponentProps<"button">>(
  function MemberFaces({ people, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={`${people.length} people`}
        {...props}
        className={cn(
          "flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent",
          className
        )}
      >
        <span className="flex">
          {people.slice(0, 3).map((p, i) => (
            <PersonAvatar key={p.orgUserId} name={p.name} image={p.profileImage} size="xs" className={cn("ring-2 ring-background", i > 0 && "-ml-1.5")} />
          ))}
        </span>
        {people.length}
      </button>
    );
  }
);

/** "New message" in the list stands for the compose view in the conversation pane. */
const COMPOSE = { id: -1, compose: true } as const;
type Pane = ConversationSummary | typeof COMPOSE;
const isCompose = (p: Pane): p is typeof COMPOSE => "compose" in p;

/**
 * Messages as a whole tool: your conversations down the left, the open one (or a new message)
 * filling the rest (InboxView; on a phone they take turns). Rendered inside a <WorkspaceModal>
 * by the dock's Expand and by /messages links (components/messages/messages-dock.tsx).
 *
 * `selectedId` -1 is the compose view.
 */
export function MessagesWorkspace({ selectedId, onSelect }: { selectedId: number | null; onSelect: (id: number | null) => void }) {
  const { orgUserId: me } = useAuth();
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const list = useConversations(debounced);
  const composing = selectedId === COMPOSE.id;
  const open = useConversation(composing ? null : selectedId);

  const items: Pane[] = React.useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const selectedItem: Pane | null = composing ? COMPOSE : (open.data ?? null);
  const select = (id: string | number | null) => onSelect(id == null ? null : Number(id));

  return (
    <InboxView<Pane>
      className="min-h-0 flex-1"
      items={items}
      getItemKey={(c) => c.id}
      selectedKey={selectedId}
      selectedItem={selectedItem}
      onSelectKey={select}
      listLabel="Conversations"
      detailLabel={composing ? "New message" : "Conversation"}
      loading={list.isPending}
      error={list.isError ? list.error : undefined}
      onRetry={() => list.refetch()}
      toolbar={
        <div className="flex items-center gap-2">
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Search people and conversations…"
            aria-label="Search conversations"
            className="min-w-0 flex-1 sm:max-w-none"
          />
          <Button
            variant={composing ? "secondary" : "outline"}
            size="icon"
            onClick={() => select(COMPOSE.id)}
            aria-label="New message"
            title="New message"
            className="shrink-0"
          >
            <SquarePen className="size-4" />
          </Button>
        </div>
      }
      listFooter={
        list.hasNextPage ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
            {list.isFetchingNextPage ? "Loading…" : "Show older conversations"}
          </Button>
        ) : undefined
      }
      renderItem={(c) => (isCompose(c) ? null : <ConversationRow c={c} me={me} />)}
      renderContextMenu={(c) =>
        isCompose(c) ? null : <ConversationMenuItems c={c} me={me} onLeft={() => selectedId === c.id && select(null)} />
      }
      renderDetail={(c) =>
        isCompose(c) ? (
          <Card data-messages-screen className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center border-b px-4 py-3 sm:px-6">
              <p className="text-[15px] font-semibold">New message</p>
            </div>
            <ComposeView onCreated={(id) => select(id)} />
          </Card>
        ) : (
          <Card data-messages-screen className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-6">
              <ConversationGlyph c={c} me={me} />
              <ConversationTitle c={c} me={me} onLeft={() => select(null)} />
            </div>
            <Thread key={c.id} conversation={c} autoFocus />
          </Card>
        )
      }
      placeholder={<InboxPlaceholder icon={MessagesSquare} title="Pick a conversation" body="Or start a new one with anybody in your organization." />}
      empty={
        !debounced && !composing ? (
          <Card className="flex min-h-0 flex-1 flex-col p-0">
            <EmptyState
              icon={MessagesSquare}
              title="No messages yet"
              body="Message an instructor about a lesson, the desk about a booking, or a technician about an aircraft. Type @ to point at an aircraft, a booking or a work order."
              action={<Button onClick={() => select(COMPOSE.id)}>New message</Button>}
              docs="messages"
            />
          </Card>
        ) : undefined
      }
    />
  );
}
