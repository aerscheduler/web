import * as React from "react";
import { AlertCircle, Bot } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  threadMessages,
  useConversationMessages,
  useDeleteMessage,
  useEditMessage,
  useMarkConversationRead,
  useLiveThread,
  useSendMessage,
  useTypingSignal,
  useWhoIsTyping,
} from "@/features/messages";
import type { ConversationMessage, ConversationPerson, ConversationSummary, MessageReplyQuote } from "@/types/messages";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "@/components/ui/message";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { ErrorState } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Composer } from "@/components/messages/composer";
import { MessageAttachments, type DraftAttachment } from "@/components/messages/attachments";
import { MentionEditor, type MentionEditorHandle } from "@/components/messages/mention-editor";
import { MessageBody } from "@/components/messages/message-body";
import { onJumpRequest, takeJump } from "@/components/messages/jump";
import { BookingCards, MessageActions, plainBody, ReactionChips, RepliesLink, seenText, ThreadHook, ThreadQuote } from "@/components/messages/message-extras";

/** Edits are allowed for this long after sending; the server enforces the same. */
const EDIT_WINDOW_MS = 15 * 60 * 1000;
/** Consecutive messages from one person this close together read as one group. */
const GROUP_GAP_MS = 5 * 60 * 1000;
/** A gap this long puts a time between messages, like a new day does. */
const TIME_GAP_MS = 60 * 60 * 1000;

type Pending = {
  clientId: string;
  body: string;
  failed: boolean;
  createdAt: string;
  attachmentIds: number[];
  /** The composer's own previews, drawn faded until the server's copy arrives. */
  attachments: DraftAttachment[];
  /** What it answers, quoted above it while it sends. */
  replyTo: MessageReplyQuote | null;
};

/** The message the composer is answering, and how the bar above the text names it. */
type Replying = { key: number; author: string; preview: string; quote: MessageReplyQuote };

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
  useLiveThread(conversation.id);
  const send = useSendMessage(conversation.id);
  const markRead = useMarkConversationRead(conversation.id);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [replying, setReplying] = React.useState<Replying | null>(null);
  // THE THREAD IN FOCUS: the conversation blurs, and this message and its replies sit over it with
  // the box reading "Reply". From Reply it closes once you send; opened from "2 Replies" or a
  // quote (`sticky`) it stays until you click outside or press Escape.
  const [focus, setFocus] = React.useState<{ id: number; sticky: boolean } | null>(null);
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
  // Armed while the conversation is being opened: the copy it opens with can be a cached one
  // from before it was marked, and the fresh one lands a moment later. After that, a mark made
  // with the conversation open stays.
  const openedMarked = React.useRef(true);
  React.useEffect(() => {
    const t = window.setTimeout(() => (openedMarked.current = false), 3000);
    return () => window.clearTimeout(t);
  }, []);
  const loaded = q.data !== undefined;
  const newestAny = messages.length ? messages[messages.length - 1]!.id : 0;
  React.useEffect(() => {
    if (!conversation.isParticipant || !loaded) return;
    // OPENING a conversation marked unread is reading it, even with nothing new in it (or
    // nothing from anybody else at all); marking the one already open stays marked until it
    // is opened again.
    const marked = !!conversation.markedUnread && openedMarked.current;
    if (marked) openedMarked.current = false;
    const target = newestFromOthers ?? (marked ? newestAny : null);
    if (target == null) return;
    if (!marked && ((conversation.lastReadMessageId ?? 0) >= target || readSent.current >= target)) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      readSent.current = target;
      markRead.mutate(target);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, newestFromOthers, conversation.isParticipant, conversation.lastReadMessageId, conversation.markedUnread]);

  // A search hit opened this conversation AT a message: page back until it is loaded, then
  // bring it into view and flash it.
  const jumpTarget = React.useRef<number | null>(takeJump(conversation.id));
  const [jumpTick, setJumpTick] = React.useState(0);
  React.useEffect(
    () =>
      onJumpRequest((id) => {
        if (id !== conversation.id) return;
        jumpTarget.current = takeJump(id);
        setJumpTick((n) => n + 1);
      }),
    [conversation.id]
  );
  React.useEffect(() => {
    const target = jumpTarget.current;
    if (target == null || q.isPending) return;
    const el = document.querySelector<HTMLElement>(`[data-mid="${target}"]`);
    if (el) {
      jumpTarget.current = null;
      // After the scroller has settled at the end (it scrolls there as a thread opens), or it
      // would take the view straight back.
      window.setTimeout(() => {
        el.scrollIntoView({ block: "center" });
        // The bubble itself pops a little and darkens for a moment, in its own shape, then
        // settles. Not a tint across the row: that read as a square highlighter stripe.
        const bubble = el.querySelector<HTMLElement>('[data-slot="bubble-content"]') ?? el;
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        bubble.style.transformOrigin = el.dataset.align === "end" ? "right center" : "left center";
        bubble.animate(
          [
            { transform: "scale(1)", filter: "brightness(1)" },
            { transform: still ? "scale(1)" : "scale(1.06)", filter: "brightness(0.84)", offset: 0.3, easing: "ease-in-out" },
            { transform: "scale(1)", filter: "brightness(1)" },
          ],
          { duration: 700, easing: "ease-out" }
        );
      }, 350);
      return;
    }
    const oldest = messages[0]?.id ?? 0;
    if (q.hasNextPage && !q.isFetchingNextPage && oldest > target) void q.fetchNextPage();
    else if (!q.hasNextPage || oldest <= target) jumpTarget.current = null;
  }, [messages, q.isPending, q.hasNextPage, q.isFetchingNextPage, jumpTick]);

  const signalTyping = useTypingSignal(conversation.isParticipant || conversation.kind === "reservation" ? conversation.id : null);
  const typing = useWhoIsTyping(conversation.id);

  // One at a time, in the order you pressed Enter. Sent side by side, fast messages reached the
  // server in any order and were numbered that way ("3, 4, 1, 2"). A failed one does not hold
  // up the rest; it waits for Try again.
  const queue = React.useRef<Promise<unknown>>(Promise.resolve());
  const deliver = (p: Pending) => {
    queue.current = queue.current.then(() =>
      send.mutateAsync({ body: p.body, clientId: p.clientId, attachmentIds: p.attachmentIds, replyToId: p.replyTo?.id ?? null }).catch((e: unknown) => {
        setPending((all) => all.map((x) => (x.clientId === p.clientId ? { ...x, failed: true } : x)));
        toast.error(e instanceof Error ? e.message : "That message didn't send.");
      })
    );
  };

  const onSend = (body: string, attachmentIds: number[] = [], attachments: DraftAttachment[] = []) => {
    signalTyping(false);
    const p: Pending = {
      clientId: crypto.randomUUID(),
      body,
      failed: false,
      createdAt: new Date().toISOString(),
      attachmentIds,
      attachments,
      replyTo: replying?.quote ?? null,
    };
    setPending((all) => [...all, p]);
    if (!focus?.sticky) closeFocus();
    deliver(p);
  };

  const startReply = (m: ConversationMessage, author: string, sticky = false) => {
    const preview = plainBody(m) || ((m.attachments?.length ?? 0) > 0 ? (m.attachments!.every((a) => a.isImage) ? "Photo" : "File") : "Message");
    setReplying({ key: m.id, author, preview, quote: { id: m.id, authorOrgUserId: m.authorOrgUserId, preview, deleted: false } });
    setFocus({ id: m.id, sticky });
  };

  const openThread = (id: number) => {
    const m = messages.find((x) => x.id === id && !x.deletedAt);
    if (!m) return void toast.message("That message is further back. Show earlier messages to find it.");
    startReply(m, "", true);
  };

  const closeFocus = () => {
    setReplying(null);
    setFocus(null);
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
    // No scroll anchors: those pin each message you send to the TOP of the view (an AI chat's
    // "prompt, then room for the answer"). A conversation follows the bottom instead: new
    // messages keep you at the end while you are there, and sending always takes you there.
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {q.isError ? (
        <div className="flex min-h-0 flex-1">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : (
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
                    conversation={conversation}
                    onRetry={retry}
                    onReply={startReply}
                    onOpenThread={openThread}
                  />
                )}
                {(typing.data?.length ?? 0) > 0 && <TypingDots people={typing.data!} group={showNames} />}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
            {focus && (
              <ThreadFocus
                original={messages.find((m) => m.id === focus.id) ?? null}
                replies={messages.filter((m) => m.replyTo?.id === focus.id && !m.deletedAt)}
                people={new Map([...conversation.participants.map((p) => [p.orgUserId, p] as const), ...Object.entries(authors).map(([k, p]) => [Number(k), p] as const)])}
                me={orgUserId}
                group={showNames}
                onClose={closeFocus}
              />
            )}
          </MessageScroller>
      )}
      <div className="shrink-0 border-t bg-background px-4 pb-4 pt-3 sm:px-6">
        <ThreadComposer
          onSend={onSend}
          onTyping={signalTyping}
          autoFocus={autoFocus}
          placeholder={replying ? "Reply" : placeholder}
          replying={replying}
          showReplyBar={false}
          onCancelReply={closeFocus}
        />
      </div>
    </div>
    </MessageScrollerProvider>
  );
}

/**
 * THE DOTS while somebody else is writing (2026-10-18): a small incoming bubble with three
 * pulsing dots at the end of the conversation, with who it is in a group.
 */
function TypingDots({ people, group }: { people: ConversationPerson[]; group: boolean }) {
  const names = people.map((p) => p.name.split(" ")[0]);
  const label = names.length === 1 ? `${names[0]} is typing` : names.length === 2 ? `${names[0]} and ${names[1]} are typing` : "Several people are typing";
  return (
    <MessageScrollerItem messageId="typing" className="pt-2">
      <div className="flex flex-col items-start gap-0.5" role="status" aria-label={label} data-typing="">
        {group && <span className="px-3 text-xs text-muted-foreground">{label}</span>}
        <span className="inline-flex h-9 items-center gap-1 rounded-[18px] bg-muted px-3.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-2 rounded-full bg-muted-foreground/60 motion-safe:animate-bounce"
              style={{ animationDelay: `${i * 140}ms`, animationDuration: "1.1s" }}
            />
          ))}
        </span>
      </div>
    </MessageScrollerItem>
  );
}

/** The composer, which also takes you to the newest message whenever you send. */
function ThreadComposer({ onSend, ...props }: React.ComponentProps<typeof Composer>) {
  const { scrollToEnd } = useMessageScroller();
  return (
    <Composer
      {...props}
      onSend={(body, ids, drafts) => {
        onSend(body, ids, drafts);
        scrollToEnd({ behavior: "auto" });
      }}
    />
  );
}

function Rows({
  messages,
  pending,
  authors,
  participants,
  me,
  showNames,
  conversation,
  onRetry,
  onReply,
  onOpenThread,
}: {
  messages: ConversationMessage[];
  pending: Pending[];
  authors: Record<string, ConversationPerson>;
  participants: ConversationPerson[];
  me: number | null;
  showNames: boolean;
  conversation: ConversationSummary;
  onRetry: (clientId: string) => void;
  onReply: (m: ConversationMessage, author: string) => void;
  onOpenThread: (id: number) => void;
}) {
  const conversationId = conversation.id;
  const del = useDeleteMessage(conversationId);
  // Deletes at once, no "are you sure" (Slack's way): it is only your own words, and it
  // leaves the thread for everyone.
  const remove = (id: number) =>
    del.mutate(id, { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't delete that message.") });
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
    | { kind: "message"; key: string; m: ConversationMessage; first: boolean; last: boolean; lineOnly: boolean; leads: boolean }
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
        !prev ||
        prev.authorKind === "system" ||
        prev.authorOrgUserId !== m.authorOrgUserId ||
        gap > GROUP_GAP_MS ||
        rows[rows.length - 1]?.kind === "stamp" ||
        // A reply starts its own group: its quote needs the room above it.
        !!m.replyTo;
      const endsGroup =
        !next ||
        next.authorKind === "system" ||
        next.authorOrgUserId !== m.authorOrgUserId ||
        new Date(next.createdAt).getTime() - at.getTime() > GROUP_GAP_MS ||
        !!next.replyTo;
      // Your own message keeps the key its pending bubble had, so delivery updates that bubble in
      // place instead of swapping one element for another (which made the list jump).
      // A reply right under what it answers, from the other side, gets the phone's thread line
      // instead of a quote: the original is in plain view, so it only needs pointing at.
      const sideOf = (x: ConversationMessage) => x.authorOrgUserId != null && x.authorOrgUserId === me;
      const adjacent = (orig: ConversationMessage | null, reply: ConversationMessage | undefined) =>
        !!orig &&
        !!reply &&
        reply.replyTo?.id === orig.id &&
        sideOf(orig) !== sideOf(reply) &&
        new Date(reply.createdAt).getTime() - new Date(orig.createdAt).getTime() <= TIME_GAP_MS &&
        sameDay(new Date(reply.createdAt), new Date(orig.createdAt)) &&
        (sideOf(reply) || conversation.kind === "direct");
      rows.push({
        kind: "message",
        key: m.clientId ? `c${m.clientId}` : `m${m.id}`,
        m,
        first: startsGroup && !adjacent(prev, m),
        last: endsGroup,
        lineOnly: adjacent(prev, m),
        leads: adjacent(m, next),
      });
    }
    prev = m;
  });
  for (const p of pending) rows.push({ kind: "pending", key: `c${p.clientId}`, p });

  // "Seen" goes under your newest message, once, and only while nothing has been sent after it.
  const newest = shown.at(-1);
  const seenUnder = !pending.length && newest && newest.authorOrgUserId === me ? newest.id : null;
  const seen = seenUnder != null ? seenText(seenUnder, conversation.readers, conversation.kind, people) : null;

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
            <MessageScrollerItem key={row.key} messageId={row.key} className="pt-0.5">
              <Message align="end">
                <MessageContent>
                  {row.p.replyTo && <ThreadQuote quote={row.p.replyTo} originalMine={row.p.replyTo.authorOrgUserId === me} onOpen={onOpenThread} />}
                  {row.p.attachments.length > 0 && (
                    <MessageAttachments
                      mine
                      local
                      attachments={row.p.attachments.map((d) => ({ id: d.key, fileName: d.file.name, isImage: !!d.previewUrl, url: d.previewUrl }))}
                    />
                  )}
                  {row.p.body && (
                    <Bubble align="end" className={cn("max-w-[75%]", !row.p.failed && "opacity-60")}>
                      <BubbleContent className="rounded-[18px] px-3.5 py-2 text-[15px] leading-[21px]">
                        <MessageBody body={row.p.body} refs={{}} mine />
                      </BubbleContent>
                    </Bubble>
                  )}
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
        const { m, first, last, lineOnly, leads } = row;
        const mine = m.authorOrgUserId != null && m.authorOrgUserId === me;
        const agent = m.authorKind === "agent";
        const author = m.authorOrgUserId != null ? people.get(m.authorOrgUserId) : undefined;
        const name = agent ? "Assistant" : (author?.name ?? "A former member");
        const actions = (
          <MessageActions
            message={m}
            conversationId={conversationId}
            me={me}
            mine={mine}
            editable={Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS}
            onReply={() => onReply(m, mine ? "yourself" : name)}
            onEdit={() => setEditingId(m.id)}
            onDelete={() => remove(m.id)}
          />
        );
        return (
          <MessageScrollerItem key={row.key} messageId={row.key} className={cn(m.replyTo ? "pt-4" : first ? "pt-2" : "pt-0.5")}>
            <Message align={mine ? "end" : "start"} className="group/row rounded-[18px]" data-mid={m.id}>
              {leads && <LeadLine onRight={!mine} />}
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
                  <div className={cn("flex min-w-0 max-w-full flex-col gap-1", mine ? "items-end" : "items-start")}>
                    {m.replyTo && !lineOnly && <ThreadQuote quote={m.replyTo} originalMine={m.replyTo.authorOrgUserId === me} onOpen={onOpenThread} />}
                    <MaybeHook quote={lineOnly ? null : (m.replyTo ?? null)} me={me} mine={mine}>
                    {/* Photos and files above the words, as their own pieces; a message can be only them.
                        The hover bar sits beside the last of them, so it is next to what it acts on. */}
                    {(m.attachments?.length ?? 0) > 0 && (
                      <BesideActions mine={mine} actions={m.body ? null : actions}>
                        <MessageAttachments attachments={m.attachments!} conversationId={conversationId} mine={mine} />
                      </BesideActions>
                    )}
                    {m.body && (
                      <BesideActions mine={mine} actions={actions}>
                        <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : agent ? "outline" : "muted"} className="max-w-[75%]">
                          <BubbleContent
                            title={new Date(m.createdAt).toLocaleString()}
                            className="rounded-[18px] px-3.5 py-2 text-[15px] leading-[21px]"
                          >
                            <MessageBody body={m.body} refs={m.refs} mine={mine} />
                          </BubbleContent>
                        </Bubble>
                      </BesideActions>
                    )}
                    </MaybeHook>
                    <BookingCards refs={m.refs} mine={mine} />
                    <ReactionChips message={m} conversationId={conversationId} me={me} people={people} mine={mine} />
                  </div>
                )}
                {m.editedAt && editingId !== m.id && <span className={cn("px-3 text-[11px] text-muted-foreground", mine && "self-end")}>Edited</span>}
                {(m.replyCount ?? 0) > 0 && <RepliesLink count={m.replyCount!} mine={mine} onOpen={() => onOpenThread(m.id)} />}
                {m.id === seenUnder && seen && (
                  <span className="self-end px-3 text-[11px] text-muted-foreground" data-seen="">
                    {seen}
                  </span>
                )}
              </MessageContent>
            </Message>
          </MessageScrollerItem>
        );
      })}
    </>
  );
}

/**
 * The phone's thread line, drawn by the ORIGINAL's row: from its bubble's middle, a short stroke
 * toward it on the reply's side, a curve, and down to just above the reply in the next row.
 */
function LeadLine({ onRight }: { onRight: boolean }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [top, setTop] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    const row = el?.parentElement;
    const bubble = row?.querySelector<HTMLElement>("[data-slot=bubble-content], [data-message-attachments]");
    if (!el || !row || !bubble) return;
    const measure = () => {
      const r = row.getBoundingClientRect();
      const b = bubble.getBoundingClientRect();
      setTop(b.top - r.top + b.height / 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  return (
    <span
      ref={ref}
      aria-hidden
      data-thread-line=""
      style={{ top: top ?? 0, visibility: top == null ? "hidden" : undefined }}
      className={cn(
        "pointer-events-none absolute -bottom-1 w-[30px] rounded-t-none border-t-4 border-[color-mix(in_oklab,var(--muted-foreground)_22%,transparent)]",
        onRight ? "right-4 rounded-tr-[12px] border-r-4" : "left-4 rounded-tl-[12px] border-l-4"
      )}
    />
  );
}

/** A reply's bubbles under the bottom half of its thread line; anything else as it is. */
function MaybeHook({ quote, me, mine, children }: { quote: MessageReplyQuote | null; me: number | null; mine: boolean; children: React.ReactNode }) {
  if (!quote) return <>{children}</>;
  return (
    <ThreadHook lineOnRight={quote.authorOrgUserId === me} replyOnRight={mine}>
      {children}
    </ThreadHook>
  );
}

/**
 * The thread in focus, over the blurred conversation: the message and every loaded reply to it,
 * newest at the bottom like the conversation. Click outside a bubble, or press Escape in the box,
 * to close it.
 */
function ThreadFocus({
  original,
  replies,
  people,
  me,
  group,
  onClose,
}: {
  original: ConversationMessage | null;
  replies: ConversationMessage[];
  people: Map<number, ConversationPerson>;
  me: number | null;
  group: boolean;
  onClose: () => void;
}) {
  const bubble = (m: ConversationMessage) => {
    const mine = m.authorOrgUserId != null && m.authorOrgUserId === me;
    const name = m.authorOrgUserId != null ? (people.get(m.authorOrgUserId)?.name ?? "A former member") : "Assistant";
    const files = m.attachments ?? [];
    return (
      <div key={m.id} className={cn("flex flex-col gap-0.5", mine ? "items-end" : "items-start")} onClick={(e) => e.stopPropagation()}>
        {group && !mine && <span className="px-3 text-xs text-muted-foreground">{name}</span>}
        <Bubble align={mine ? "end" : "start"} variant={mine ? "default" : "muted"} className="max-w-[75%]">
          <BubbleContent className="rounded-[18px] px-3.5 py-2 text-[15px] leading-[21px]">
            {m.body ? (
              <MessageBody body={m.body} refs={m.refs} mine={mine} />
            ) : (
              <span className="italic">{files.length && files.every((f) => f.isImage) ? "Photo" : "File"}</span>
            )}
          </BubbleContent>
        </Bubble>
      </div>
    );
  };
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-end overflow-y-auto bg-background/60 px-4 pb-4 pt-6 backdrop-blur-md animate-in fade-in-0 sm:px-6"
      onClick={onClose}
      data-thread-focus=""
    >
      <div className="flex flex-col gap-1.5">
        {original && bubble(original)}
        {replies.map(bubble)}
      </div>
    </div>
  );
}

/** A piece of a message with the hover bar beside it, on the side away from the edge. */
function BesideActions({ mine, actions, children }: { mine: boolean; actions: React.ReactNode; children: React.ReactNode }) {
  return <div className={cn("flex w-full min-w-0 items-center gap-1.5", mine && "flex-row-reverse")}>{children}{actions}</div>;
}

/**
 * Editing a message where it sits: the bubble becomes a text box with the words in it.
 * Enter saves, Shift+Enter is a new line, Escape cancels (and only cancels: it does not also
 * close the Messages panel, see `data-keeps-escape`).
 */
function InlineEdit({ message, conversationId, onDone }: { message: ConversationMessage; conversationId: number; onDone: () => void }) {
  const edit = useEditMessage(conversationId);
  const ref = React.useRef<MentionEditorHandle>(null);
  const [empty, setEmpty] = React.useState(false);

  // The words come back with their mentions as pills, each still its token underneath, so an
  // edit keeps every mention it does not remove (even one this writer can no longer open).
  const save = (body: string) => {
    if (edit.isPending) return;
    if (body === message.body) return onDone();
    edit.mutate(
      { id: message.id, body },
      { onSuccess: onDone, onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't save that edit.") }
    );
  };

  return (
    <div className="flex w-full max-w-[85%] flex-col gap-1 self-end" data-keeps-escape>
      <MentionEditor
        ref={ref}
        autoFocus
        placeholder="Edit message"
        ariaLabel="Edit message"
        initial={{ body: message.body, refs: message.refs }}
        onSubmit={save}
        allowEmptySubmit={(message.attachments?.length ?? 0) > 0}
        onEscape={onDone}
        onEmptyChange={setEmpty}
        pickerClassName="bottom-auto top-full mb-0 mt-2"
        editorClassName="messages-editor max-h-48 w-full overflow-y-auto rounded-[18px] border border-ring bg-background px-3.5 py-2 text-[15px] leading-[21px] ring-2 ring-ring/30"
      />
      <p className="self-end px-1 text-[11px] text-muted-foreground">
        Escape to{" "}
        <button type="button" onClick={onDone} className="font-medium text-foreground hover:underline">
          cancel
        </button>
        {" · "}Enter to{" "}
        <button type="button" onClick={() => ref.current?.submit()} disabled={empty || edit.isPending} className="font-medium text-foreground hover:underline disabled:opacity-50">
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
