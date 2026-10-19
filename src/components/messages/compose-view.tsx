import * as React from "react";
import { Users, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useMembers } from "@/features/queries";
import { conversationKeys, useCreateGroup, useMemberGroups, useOpenDirect, useOpenMemberGroup } from "@/features/messages";
import type { ConversationSummary } from "@/types/messages";
import { memberName } from "@/components/people/util";
import { PersonAvatar } from "@/components/workspace-user-avatar";
import { Composer } from "@/components/messages/composer";

type Pick = { id: number; name: string; image: string | null };
/** One row of the list: a person to add, or a member group to open (2026-10-19). */
type Option = ({ kind: "person" } & Pick) | { kind: "group"; id: number; name: string; memberCount: number; conversationId: number | null };

/**
 * A new message, written where the conversation will be: a To: line you add people to as chips,
 * and the message box under it (Slack's and Messages' way; no dialog). One person makes a direct
 * conversation, two or more a group, which may take a name. Sending creates the conversation,
 * posts the message, and hands back its id so the caller opens it.
 *
 * MEMBER GROUPS (2026-10-19) are listed above the people while the To: line is empty: picking
 * one opens the conversation that follows that group (starting it the first time), where its
 * members already are. It is a destination, not a chip: a group is not mixed with people.
 */
export function ComposeView({ onCreated, compact = false }: { onCreated: (conversationId: number) => void; compact?: boolean }) {
  const { orgUserId: me } = useAuth();
  const qc = useQueryClient();
  const members = useMembers();
  const direct = useOpenDirect();
  const group = useCreateGroup();
  const groups = useMemberGroups();
  const openGroup = useOpenMemberGroup();
  const [picked, setPicked] = React.useState<Pick[]>([]);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [title, setTitle] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(true);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => inputRef.current?.focus(), []);

  const options = React.useMemo((): Option[] => {
    const q = query.trim().toLowerCase();
    const taken = new Set(picked.map((p) => p.id));
    const people = (members.data ?? [])
      .filter((m) => m.id !== me && !m.archivedAt && !taken.has(m.id))
      .map((m) => ({ kind: "person" as const, id: m.id, name: memberName(m), image: m.profileImage ?? null }))
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
    // Groups only before anybody is picked: a member group is where you go, not who you add.
    const matching = picked.length
      ? []
      : (groups.data ?? []).filter((g) => !q || g.name.toLowerCase().includes(q)).slice(0, 5).map((g) => ({ kind: "group" as const, ...g }));
    return [...matching, ...people];
  }, [members.data, groups.data, picked, query, me]);

  React.useEffect(() => setActive(0), [query]);

  const add = (p: Pick) => {
    setPicked((all) => [...all, p]);
    setQuery("");
    inputRef.current?.focus();
  };

  const choose = (o: Option) => {
    if (o.kind === "person") return add(o);
    openGroup.mutate(o.id, {
      onSuccess: (c) => onCreated(c.id),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't open that group's conversation."),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !query && picked.length) {
      setPicked((all) => all.slice(0, -1));
      return;
    }
    if (!options.length) return;
    if (e.key === "ArrowDown") (e.preventDefault(), setActive((i) => (i + 1) % options.length));
    if (e.key === "ArrowUp") (e.preventDefault(), setActive((i) => (i - 1 + options.length) % options.length));
    if (e.key === "Enter" && query.trim()) (e.preventDefault(), choose(options[active]!));
  };

  const send = async (body: string, attachmentIds: number[] = []) => {
    if (!picked.length || sending) return;
    setSending(true);
    try {
      const ids = picked.map((p) => p.id);
      const c: ConversationSummary =
        ids.length === 1 ? await direct.mutateAsync(ids[0]!) : await group.mutateAsync({ title: title.trim() || undefined, orgUserIds: ids });
      await api(`/conversations/${c.id}/messages`, { method: "POST", body: { body, clientId: crypto.randomUUID(), attachmentIds } });
      await qc.invalidateQueries({ queryKey: conversationKeys.all });
      onCreated(c.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That message didn't send.");
      setSending(false);
    }
  };

  const showList = listOpen && (query.trim().length > 0 || picked.length === 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("shrink-0 border-b", compact ? "px-3 py-2" : "px-4 py-3 sm:px-6")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-sm text-muted-foreground">To:</span>
          {picked.map((p) => (
            <span key={p.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-primary/10 pl-1 pr-1.5 text-sm text-foreground">
              <PersonAvatar name={p.name} image={p.image} size="sm" />
              {p.name}
              <button
                type="button"
                aria-label={`Remove ${p.name}`}
                onClick={() => setPicked((all) => all.filter((x) => x.id !== p.id))}
                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
            }}
            onFocus={() => setListOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={picked.length ? "Add another person" : "Type a name or a group"}
            aria-label="To"
            className="h-7 min-w-[10rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {picked.length > 1 && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            placeholder="Name the group (optional)"
            aria-label="Group name"
            className="mt-2 h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {showList && (
          <ul role="listbox" aria-label="People and groups" className="p-2">
            {members.isPending ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Loading people…</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Nobody and no group by that name.</li>
            ) : (
              options.map((o, i) => (
                <li key={`${o.kind}-${o.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    disabled={o.kind === "group" && openGroup.isPending}
                    className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", i === active && "bg-accent")}
                    data-member-group={o.kind === "group" ? o.id : undefined}
                  >
                    {o.kind === "group" ? (
                      <>
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
                          <Users className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{o.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            Group · {o.memberCount} {o.memberCount === 1 ? "person" : "people"}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden className="contents">
                          <PersonAvatar name={o.name} image={o.image} size="md" />
                        </span>
                        {o.name}
                      </>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      <div className={cn("shrink-0 border-t bg-background", compact ? "px-3 pb-3 pt-2.5" : "px-4 pb-4 pt-3 sm:px-6")}>
        <Composer
          placeholder={picked.length ? "Write a message" : "Add someone above first"}
          onSend={(b, ids) => void send(b, ids)}
          disabled={!picked.length || sending}
        />
      </div>
    </div>
  );
}
