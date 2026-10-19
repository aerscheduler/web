import { useAuth } from "@/lib/auth";
import { useMessageSearch } from "@/features/messages";
import { requestJump } from "@/components/messages/jump";
import { plainBody } from "@/components/messages/message-extras";
import type { MessageSearchHit } from "@/types/messages";

/** "Today 9:41", "Tue", "Oct 3": when a found message was written. */
function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - d.getTime() < 6 * 86400_000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

/** The found words, with the match in bold and the text around it trimmed to fit one line. */
function Snippet({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return <>{text}</>;
  const start = Math.max(0, i - 24);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark className="rounded-sm bg-primary/15 px-0.5 font-semibold text-foreground">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * MESSAGES THAT MATCH A SEARCH (2026-10-18), under the conversations that match: who wrote it,
 * where, when, and the words with the match picked out. Choosing one opens its conversation at
 * that message. Shown for 2 characters or more.
 */
export function MessageSearchResults({ q, onOpen }: { q: string; onOpen: (conversationId: number) => void }) {
  const { orgUserId: me } = useAuth();
  const term = q.trim();
  const search = useMessageSearch(term);
  if (term.length < 2) return null;
  const hits: MessageSearchHit[] = search.data?.pages.flatMap((p) => p.data) ?? [];
  const authors = Object.assign({}, ...(search.data?.pages.map((p) => p.authors ?? {}) ?? []));
  return (
    <section aria-label="Messages that match" className="border-t" data-message-search="">
      <h3 className="px-3.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Messages</h3>
      {search.isPending ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">Searching…</p>
      ) : hits.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">No messages say “{term}”.</p>
      ) : (
        <ul role="list">
          {hits.map(({ message: m, conversationTitle }) => {
            const who = m.authorOrgUserId === me ? "You" : (authors[m.authorOrgUserId ?? -1]?.name ?? "A former member");
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    requestJump(m.conversationId, m.id);
                    onOpen(m.conversationId);
                  }}
                  className="w-full px-3.5 py-2 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
                  data-search-hit={m.id}
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold">{conversationTitle}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{when(m.createdAt)}</span>
                  </span>
                  <span className="line-clamp-2 text-[13px] text-muted-foreground">
                    {who !== conversationTitle && <span className="text-foreground">{who}: </span>}
                    <Snippet text={plainBody(m)} q={term} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {search.hasNextPage && (
        <button type="button" className="w-full py-2 text-sm text-muted-foreground hover:bg-accent" onClick={() => search.fetchNextPage()}>
          Show more messages
        </button>
      )}
    </section>
  );
}
