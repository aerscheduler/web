import * as React from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Copy, MoreHorizontal, Pencil, Reply, SmilePlus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEVICE_TIME_ZONE, formatDateInZone, formatTimeRangeInZone } from "@/lib/timezone";
import { useReactToMessage } from "@/features/messages";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { refLink, TOKEN_RE } from "@/components/messages/message-body";
import {
  REACTION_EMOJI,
  type ConversationMessage,
  type ConversationPerson,
  type MessageReaction,
  type MessageRef,
  type MessageReplyQuote,
  type ReservationCard,
} from "@/types/messages";

//---------------------------------------------------------------------------------
// What sits around a message bubble (2026-10-18): the hover bar (react, reply, more), the
// reactions under it, the quote above a reply, "Seen" under your last message, and a card for
// each booking it mentions.
//---------------------------------------------------------------------------------

/** "You", a name, "You and Ann", "Ann, Ben and 2 others". */
export function namesList(ids: number[], me: number | null, people: Map<number, ConversationPerson>, max = 3): string {
  const names = ids.map((id) => (id === me ? "You" : (people.get(id)?.name ?? "A former member")));
  // You first, the way people read their own name.
  names.sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${names.slice(0, max - 1).join(", ")} and ${names.length - (max - 1)} others`;
}

/** The emoji under a bubble. Click one to pick it (or, when it is yours, to take it back). */
export function ReactionChips({
  message,
  conversationId,
  me,
  people,
  mine,
}: {
  message: ConversationMessage;
  conversationId: number;
  me: number | null;
  people: Map<number, ConversationPerson>;
  mine: boolean;
}) {
  const react = useReactToMessage(conversationId);
  const reactions = message.reactions ?? [];
  if (!reactions.length) return null;
  const toggle = (r: MessageReaction) => {
    const isMine = me != null && r.orgUserIds.includes(me);
    react.mutate(
      { id: message.id, emoji: isMine ? null : r.emoji },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't react to that message.") }
    );
  };
  return (
    <div className={cn("-mt-1.5 flex flex-wrap gap-1 px-1.5", mine ? "justify-end self-end" : "self-start")} data-message-reactions="">
      {reactions.map((r) => {
        const isMine = me != null && r.orgUserIds.includes(me);
        const who = namesList(r.orgUserIds, me, people, 6);
        return (
          <Tooltip key={r.emoji}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => toggle(r)}
                aria-label={`${r.emoji} ${r.orgUserIds.length}, ${who}${isMine ? ". Click to take yours back." : ""}`}
                aria-pressed={isMine}
                className={cn(
                  // A fill and no outline until you hover, the way a reaction should sit under a
                  // message: present, not boxed. Yours keeps its outline so you can find it.
                  "relative inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs transition-colors",
                  isMine
                    ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-transparent bg-muted text-muted-foreground hover:border-foreground/25 hover:bg-background"
                )}
              >
                <span className="text-[13px] leading-none">{r.emoji}</span>
                {r.orgUserIds.length > 1 && <span className="font-medium tabular-nums">{r.orgUserIds.length}</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="flex max-w-56 flex-col items-center gap-1.5 px-3 py-2.5 text-center">
              <span className="flex size-12 items-center justify-center rounded-lg bg-background text-3xl leading-none">{r.emoji}</span>
              <span>
                <span className="font-semibold">{who}</span> reacted
              </span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * The bar that appears beside a message on hover (and stays while one of its menus is open):
 * React, Reply, and More (Copy, and on your own Edit and Delete).
 */
export function MessageActions({
  message,
  conversationId,
  me,
  mine,
  editable,
  onReply,
  onEdit,
  onDelete,
}: {
  message: ConversationMessage;
  conversationId: number;
  me: number | null;
  mine: boolean;
  editable: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const react = useReactToMessage(conversationId);
  const [picking, setPicking] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const current = (message.reactions ?? []).find((r) => me != null && r.orgUserIds.includes(me))?.emoji ?? null;

  const pick = (emoji: string) => {
    setPicking(false);
    react.mutate(
      { id: message.id, emoji: emoji === current ? null : emoji },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't react to that message.") }
    );
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainBody(message));
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy that message.");
    }
  };

  const button =
    "inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-full border bg-background p-0.5 shadow-sm transition-opacity",
        picking || menu ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/row:opacity-100"
      )}
      data-message-actions=""
    >
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="React" title="React" className={button}>
            <SmilePlus className="size-4" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align={mine ? "end" : "start"} className="w-auto rounded-full p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
          <div className="flex items-center gap-0.5" role="group" aria-label="Reactions">
            {REACTION_EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                aria-label={`React ${e}`}
                aria-pressed={current === e}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110 hover:bg-muted",
                  current === e && "bg-primary/10 ring-1 ring-primary/40"
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <button type="button" aria-label="Reply" title="Reply" onClick={onReply} className={button}>
        <Reply className="size-4" aria-hidden />
      </button>
      <DropdownMenu open={menu} onOpenChange={setMenu}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More" title="More" className={button}>
            <MoreHorizontal className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={mine ? "end" : "start"}>
          {message.body && (
            <DropdownMenuItem onSelect={() => void copy()}>
              <Copy aria-hidden /> Copy text
            </DropdownMenuItem>
          )}
          {mine && editable && (
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil aria-hidden /> Edit
            </DropdownMenuItem>
          )}
          {mine && (
            <DropdownMenuItem onSelect={onDelete}>
              <Trash2 aria-hidden /> Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** The message as plain words: mentions by their labels, as the reader sees them. */
export function plainBody(m: Pick<ConversationMessage, "body" | "refs">): string {
  return m.body.replace(TOKEN_RE, (_t, letter: string, id: string) => {
    const ref = m.refs[`${letter}:${id}`];
    if (!ref) return "a record";
    return ref.type === "person" && !ref.hidden ? `@${ref.label}` : ref.label;
  });
}

/**
 * The quote above a reply: who wrote the original and its first line. Click to go to it (when it
 * is still in the loaded thread).
 */
export function ReplyQuoteView({
  quote,
  me,
  people,
  mine,
  onJump,
}: {
  quote: MessageReplyQuote;
  me: number | null;
  people: Map<number, ConversationPerson>;
  mine: boolean;
  onJump: (id: number) => void;
}) {
  const author = quote.authorOrgUserId == null ? null : quote.authorOrgUserId === me ? "You" : (people.get(quote.authorOrgUserId)?.name ?? "A former member");
  const text = quote.deleted ? "Message deleted" : quote.preview || "Message";
  return (
    <button
      type="button"
      onClick={() => onJump(quote.id)}
      disabled={quote.deleted}
      className={cn(
        "mb-0.5 flex max-w-[75%] min-w-0 flex-col rounded-[14px] border-l-[3px] border-primary/60 bg-muted/60 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:hover:bg-muted/60",
        mine ? "self-end" : "self-start"
      )}
      data-reply-quote=""
    >
      {author && <span className="font-semibold text-foreground">{author}</span>}
      <span className={cn("line-clamp-2 text-muted-foreground", quote.deleted && "italic")}>{text}</span>
    </button>
  );
}

/** "Replying to Ann" above the composer's text, with the line it answers and an X. */
export function ReplyingBar({ author, preview, onCancel }: { author: string; preview: string; onCancel: () => void }) {
  return (
    <div className="flex items-start gap-2 border-b px-3.5 py-2" data-replying="">
      <Reply className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold">Replying to {author}</p>
        <p className="truncate text-muted-foreground">{preview || "Message"}</p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

const CARD_STATUS: Record<ReservationCard["status"], { label: string; tone: string }> = {
  upcoming: { label: "Upcoming", tone: "bg-muted text-muted-foreground" },
  now: { label: "Now", tone: "bg-primary/10 text-primary" },
  out: { label: "Out now", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  past: { label: "Past", tone: "bg-muted text-muted-foreground" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground line-through" },
};

/** One card per booking the message mentions (up to three), each opening the booking. */
export function BookingCards({ refs, mine }: { refs: Record<string, MessageRef>; mine: boolean }) {
  const cards = Object.values(refs).filter((r): r is MessageRef & { card: ReservationCard } => r.type === "reservation" && !r.hidden && !!r.card).slice(0, 3);
  if (!cards.length) return null;
  return (
    <div className={cn("flex w-full max-w-[75%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")} data-booking-cards="">
      {cards.map((r) => {
        const c = r.card;
        const link = refLink(r)!;
        const status = CARD_STATUS[c.status];
        return (
          <Link
            key={r.id}
            to={link.to as never}
            params={link.params as never}
            className="flex w-72 max-w-full flex-col gap-1 rounded-[14px] border bg-background px-3 py-2.5 text-left shadow-sm transition-colors hover:border-primary/40"
            data-booking-card={r.id}
          >
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", status.tone)}>{status.label}</span>
            </span>
            <span className="text-xs text-foreground">
              {/* The shared range reads "2:00 PM, 3:00 PM"; on a card "to" says it plainer. */}
              {formatDateInZone(c.start, c.timeZoneName)} · {formatTimeRangeInZone(c.start, c.end, c.timeZoneName, DEVICE_TIME_ZONE).replace(", ", " to ")}
            </span>
            {(c.resourceName || c.people.length > 0) && (
              <span className="truncate text-xs text-muted-foreground">{[c.resourceName, c.people.join(", ")].filter(Boolean).join(" · ")}</span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * "Seen" under your newest message: in a direct conversation once they have read it, in a group
 * who has ("Seen by Ann and Ben", "Seen by everyone").
 */
export function seenText(
  messageId: number,
  readers: Array<{ orgUserId: number; lastReadMessageId: number | null }> | undefined,
  kind: "direct" | "group" | "reservation",
  people: Map<number, ConversationPerson>
): string | null {
  if (!readers?.length) return null;
  const seen = readers.filter((r) => (r.lastReadMessageId ?? 0) >= messageId).map((r) => r.orgUserId);
  if (!seen.length) return null;
  if (kind === "direct") return "Seen";
  if (seen.length === readers.length) return readers.length === 1 ? "Seen" : "Seen by everyone";
  return `Seen by ${namesList(seen, null, people)}`;
}
