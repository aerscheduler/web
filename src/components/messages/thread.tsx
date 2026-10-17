import * as React from "react";
import { AlertCircle, Bot, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  threadMessages,
  useConversationMessages,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useSendMessage,
} from "@/features/messages";
import type { ConversationMessage, ConversationPerson, ConversationSummary } from "@/types/messages";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/components/messages/composer";
import { MessageBody, bodyAsText } from "@/components/messages/message-body";

/** Edits are allowed for this long after sending; the server enforces the same. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Consecutive messages from one person this close together read as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** A gap this long puts a time between messages, like a new day does. */
const TIME_GAP_MS = 60 * 60 * 1000;

type Pending = { clientId: string; body: string; failed: boolean; createdAt: string };

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Today 9:41 AM", "Yesterday 4:02 PM", "Tue 9:41 AM", "Oct 3, 9:41 AM". */
export function stampLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay(d, now)) return `Today ${time}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `Yesterday ${time}`;
  if (now.getTime() - d.getTime() < 6 * 24 * 3600 * 1000) return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}, ${time}`;
}

/**
 * One conversation: its messages, newest at the bottom, and the box to write in.
 *
 * Used whole on the Messages page and inside a booking's Conversation tab. It knows nothing
 * about where it sits; the caller puts a header above it.
 */
export function Thread({
  conversation,
  className,
  autoFocus = false,
}: {
  conversation: ConversationSummary;
  className?: string;
  /** Take the caret on open. The Messages page does; a booking page must not jump to its card. */
  autoFocus?: boolean;
}) {
  const { orgUserId } = useAuth();
  const q = useConversationMessages(conversation.id);
  const send = useSendMessage(conversation.id);
  const markRead = useMarkConversationRead(conversation.id);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const { messages, authors } = threadMessages(q.data);

  // A pending message leaves the list the moment the server's copy of it arrives.
  const delivered = React.useMemo(() => new Set(messages.map((m) => m.clientId).filter(Boolean)), [messages]);
  const shownPending = pending.filter((p) => !delivered.has(p.clientId));

  // Mark read when the newest message from somebody else is on screen and the tab is in front.
  const newestFromOthers = React.useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]!;
      if (m.authorOrgUserId !== orgUserId) return m.id;
    }
    return null;
  }, [messages, orgUserId]);
  const readSent = React.useRef<number>(0);
  React.useEffect(() => {
    if (!conversation.isParticipant || newestFromOthers == null) return;
    if ((conversation.lastReadMessageId ?? 0) >= newestFromOthers || readSent.current >= newestFromOthers) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      readSent.current = newestFromOthers;
      markRead.mutate(newestFromOthers);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestFromOthers, conversation.isParticipant, conversation.lastReadMessageId]);

  const deliver = (p: Pending) => {
    send.mutate(
      { body: p.body, clientId: p.clientId },
      {
        onError: (e) => {
          setPending((all) => all.map((x) => (x.clientId === p.clientId ? { ...x, failed: true } : x)));
          toast.error(e instanceof Error ? e.message : "That message didn't send.");
        },
      }
    );
  };

  const onSend = (body: string) => {
    const p: Pending = { clientId: crypto.randomUUID(), body, failed: false, createdAt: new Date().toISOString() };
    setPending((all) => [...all, p]);
    deliver(p);
  };

  const retry = (clientId: string) => {
    const p = pending.find((x) => x.clientId === clientId);
    if (!p) return;
    setPending((all) => all.map((x) => (x.clientId === clientId ? { ...x, failed: false } : x)));
    deliver({ ...p, failed: false });
  };

  const showNames = conversation.kind !== "direct";
  const placeholder =
    conversation.kind === "direct" ? `Message ${conversation.title}` : conversation.kind === "reservation" ? "Message everyone on this booking" : `Message ${conversation.title}`;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {q.isError ? (
        <div className="flex min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : (
        <MessageScrollerProvider autoScroll defaultScrollPosition="end">
          <MessageScroller className="flex-1">
            <MessageScrollerViewport preserveScrollOnPrepend aria-label="Messages">
              <MessageScrollerContent className="gap-0 px-4 py-4 sm:px-6">
                {q.hasNextPage && (
                  <div className="flex justify-center pb-4">
                    <Button variant="ghost" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                      {q.isFetchingNextPage ? "Loading…" : "Show earlier messages"}
                    </Button>
                  </div>
                )}
                {q.isPending ? (
                  <ThreadSkeleton />
                ) : messages.length === 0 && shownPending.length === 0 ? (
                  <EmptyThread conversation={conversation} />
                ) : (
                  <Rows
                    messages={messages}
                    pending={shownPending}
                    authors={authors}
                    participants={conversation.participants}
                    me={orgUserId}
                    showNames={showNames}
                    conversationId={conversation.id}
                    onRetry={retry}
                  />
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>
      )}
      <div className="shrink-0 border-t bg-background px-4 pb-4 pt-3 sm:px-6">
        <Composer placeholder={placeholder} onSend={onSend} autoFocus={autoFocus} />
      </div>
    </div>
  );
}

function Rows({
  messages,
  pending,
  authors,
  participants,
  me,
  showNames,
  conversationId,
  onRetry,
}: {
  messages: ConversationMessage[];
  pending: Pending[];
  authors: Record<string, ConversationPerson>;
  participants: ConversationPerson[];
  me: number | null;
  showNames: boolean;
  conversationId: number;
  onRetry: (clientId: string) => void;
}) {
  const people = React.useMemo(() => {
    const map = new Map<number, ConversationPerson>();
    for (const p of participants) map.set(p.orgUserId, p);
    for (const [id, p] of Object.entries(authors)) map.set(Number(id), p);
    return map;
  }, [authors, participants]);
  // The one message being edited, in place of its bubble (Slack's way: no dialog).
  const [editingId, setEditingId] = React.useState<number | null>(null);

  type Row =
    | { kind: "stamp"; key: string; label: string }
    | { kind: "system"; key: string; m: ConversationMessage }
    | { kind: "message"; key: string; m: ConversationMessage; first: boolean; last: boolean }
    | { kind: "pending"; key: string; p: Pending };

  const rows: Row[] = [];
  let prev: ConversationMessage | null = null;
  // A deleted message is gone from the thread for everyone (the server keeps the row, blanked).
  const shown = messages.filter((m) => !m.deletedAt);
  shown.forEach((m, i) => {
    const at = new Date(m.createdAt);
    const gap = prev ? at.getTime() - new Date(prev.createdAt).getTime() : Infinity;
    if (!prev || gap > TIME_GAP_MS || !sameDay(at, new Date(prev.createdAt))) {
      rows.push({ kind: "stamp", key: `t${m.id}`, label: stampLabel(m.createdAt) });
    }
    if (m.authorKind === "system") {
      rows.push({ kind: "system", key: `s${m.id}`, m });
    } else {
      const next = shown[i + 1];
      const startsGroup =
        !prev || prev.authorKind === "system" || prev.authorOrgUserId !== m.authorOrgUserId || gap > GROUP_GAP_MS || rows[rows.length - 1]?.kind === "stamp";
      const endsGroup =
        !next ||
        next.authorKind === "system" ||
        next.authorOrgUserId !== m.authorOrgUserId ||
        new Date(next.createdAt).getTime() - at.getTime() > GROUP_GAP_MS;
      rows.push({ kind: "message", key: `m${m.id}`, m, first: startsGroup, last: endsGroup });
    }
    prev = m;
  });
  for (const p of pending) rows.push({ kind: "pending", key: `p${p.clientId}`, p });

  return (
    <>
      {rows.map((row) => {
        if (row.kind === "stamp") {
          return (
            <MessageScrollerItem key={row.key} className="py-3">
              <p className="text-center text-xs font-medium text-muted-foreground">{row.label}</p>
            </MessageScrollerItem>
          );
        }
        if (row.kind === "system") {
          return (
            <MessageScrollerItem key={row.key} className="py-2">
              <Marker className="justify-center text-xs">
                <MarkerContent>
                  <MessageBody body={row.m.body} refs={row.m.refs} mine={false} />
                </MarkerContent>
              </Marker>
            </MessageScrollerItem>
          );
        }
        if (row.kind === "pending") {
          return (
            <MessageScrollerItem key={row.key} scrollAnchor className="pt-0.5">
              <Message align="end">
                <MessageContent>
                  <Bubble align="end" className={cn("max-w-[75%]", !row.p.failed && "opacity-60")}>
                    <BubbleContent className="rounded-[18px] px-3.5 py-2 text-[15px] leading-[21px]">
                      <MessageBody body={row.p.body} refs={{}} mine />
                    </BubbleContent>
                  </Bubble>
                  {row.p.failed && (
                    <button
                      type="button"
                      onClick={() => onRetry(row.p.clientId)}
                      className="inline-flex items-center gap-1 self-end text-xs text-muted-foreground hover:text-foreground"
                    >
                      <AlertCircle className="size-3.5 text-amber-600" aria-hidden /> Not delivered. Try again
                    </button>
                  )}
                </MessageContent>
              </Message>
            </MessageScrollerItem>
          );
        }
        const { m, first, last } = row;
        const mine = m.authorOrgUserId != null && m.authorOrgUserId === me;
        const agent = m.authorKind === "agent";
        const author = m.authorOrgUserId != null ? people.get(m.authorOrgUserId) : undefined;
        const name = agent ? "Assistant" : (author?.name ?? "A former member");
        return (
          <MessageScrollerItem key={row.key} messageId={String(m.id)} scrollAnchor={mine} className={cn(first ? "pt-2" : "pt-0.5")}>
            <Message align={mine ? "end" : "start"} className="group/row">
              {!mine && showNames && (
                <MessageAvatar className={cn("size-7 min-w-7 bg-transparent", !last && "invisible")}>
                  {agent ? (
                    <span className="flex size-7 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                      <Bot className="size-4" aria-hidden />
                    </span>
                  ) : (
                    <PersonAvatar name={name} image={author?.profileImage} size="md" className="size-7" />
                  )}
                </MessageAvatar>
              )}
              <MessageContent className="gap-0.5">
                {!mine && showNames && first && <MessageHeader className="px-3">{name}</MessageHeader>}
                {editingId === m.id ? (
                  <InlineEdit message={m} conversationId={conversationId} onDone={() => setEditingId(null)} />
                ) : (
                  <div className={cn("flex items-center gap-1", mine && "flex-row-reverse")}>
                    <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : agent ? "outline" : "muted"} className="max-w-[75%]">
                      <BubbleContent
                        title={new Date(m.createdAt).toLocaleString()}
                        className="rounded-[18px] px-3.5 py-2 text-[15px] leading-[21px]"
                      >
                        <MessageBody body={m.body} refs={m.refs} mine={mine} />
                      </BubbleContent>
                    </Bubble>
                    {mine && (
                      <OwnMessageMenu message={m} conversationId={conversationId} onEdit={() => setEditingId(m.id)} />
                    )}
                  </div>
                )}
                {m.editedAt && editingId !== m.id && <span className={cn("px-3 text-[11px] text-muted-foreground", mine && "self-end")}>Edited</span>}
              </MessageContent>
            </Message>
          </MessageScrollerItem>
        );
      })}
    </>
  );
}

/** Edit (for 15 minutes) and Delete, on your own messages. Appears on hover. */
function OwnMessageMenu({ message, conversationId, onEdit }: { message: ConversationMessage; conversationId: number; onEdit: () => void }) {
  const del = useDeleteMessage(conversationId);
  const editable = Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS;

  // Deletes at once, no "are you sure" (Slack's way): it is only your own words, and it
  // leaves the thread for everyone.
  const remove = () =>
    del.mutate(message.id, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete that message.") });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Message options"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {editable && <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>}
        <DropdownMenuItem onSelect={remove}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Editing a message where it sits: the bubble becomes a text box with the words in it.
 * Enter saves, Shift+Enter is a new line, Escape cancels (and only cancels: it does not also
 * close the dock or the Messages modal, see `data-keeps-escape`).
 */
function InlineEdit({ message, conversationId, onDone }: { message: ConversationMessage; conversationId: number; onDone: () => void }) {
  const edit = useEditMessage(conversationId);
  const [text, setText] = React.useState(() => bodyAsText(message.body, message.refs));
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed || edit.isPending) return;
    // Put the mentions back: each label the message had becomes its token again.
    let body = trimmed;
    const refs = Object.entries(message.refs).sort((a, b) => b[1].label.length - a[1].label.length);
    for (const [key, r] of refs) {
      if (r.hidden) continue;
      const label = r.type === "person" ? `@${r.label}` : r.label;
      body = body.split(label).join(`{${key}}`);
    }
    if (body === message.body) return onDone();
    edit.mutate(
      { id: message.id, body },
      { onSuccess: onDone, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save that edit.") }
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onDone();
    }
  };

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-1 self-end">
      <textarea
        ref={ref}
        data-keeps-escape
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        aria-label="Edit message"
        className="max-h-48 w-full resize-none rounded-[18px] border border-ring bg-background px-3.5 py-2 text-[15px] leading-[21px] outline-none ring-2 ring-ring/30"
      />
      <p className="self-end px-1 text-[11px] text-muted-foreground">
        Escape to{" "}
        <button type="button" onClick={onDone} className="font-medium text-foreground hover:underline">
          cancel
        </button>
        {" · "}Enter to{" "}
        <button type="button" onClick={save} disabled={!text.trim() || edit.isPending} className="font-medium text-foreground hover:underline disabled:opacity-50">
          save
        </button>
      </p>
    </div>
  );
}

function EmptyThread({ conversation }: { conversation: ConversationSummary }) {
  const text =
    conversation.kind === "reservation"
      ? "Nothing here yet. Messages here reach everyone on the booking, and the organization's staff can read them."
      : conversation.kind === "group"
        ? "Nothing here yet. Say hello to the group."
        : `This is the start of your conversation with ${conversation.title}.`;
  return <p className="m-auto max-w-sm py-16 text-center text-sm text-muted-foreground">{text}</p>;
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-6" aria-hidden>
      <Skeleton className="h-9 w-56 rounded-[18px]" />
      <Skeleton className="h-9 w-40 self-end rounded-[18px]" />
      <Skeleton className="h-14 w-72 rounded-[18px]" />
      <Skeleton className="h-9 w-48 self-end rounded-[18px]" />
    </div>
  );
}
