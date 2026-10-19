import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { apiRaw, api, ApiError } from "@/lib/api";
import { presignedObjectUrl, uploadToPresignedPost, type PresignedPost } from "@/lib/upload";
import type {
  ConversationListPage,
  ConversationMessage,
  ConversationPerson,
  ConversationSummary,
  MessageSearchPage,
  MessageableGroup,
  MessagesPage,
} from "@/types/messages";

//---------------------------------------------------------------------------------
// Messages (2026-10-16). Everything lives under the "conversations" root, which is also the
// one root the realtime `messages` channel invalidates: a new message for this member
// refetches their list, the badge and the open conversation's summary, over REST, where the
// read rules are.
//
// Except the THREAD itself, which sits outside that root ("conversation-thread") on purpose.
// Refetching an infinite query reloads every page it holds, so each message (yours included,
// typed fast) reloaded the whole conversation and the list jumped. Instead the thread is
// written in place: what you send, edit or delete goes straight into the cache from the
// server's reply, and a socket event fetches only the newest page and merges it
// (useLiveThread, mergeIntoThread).
//---------------------------------------------------------------------------------

export const conversationKeys = {
  all: ["conversations"] as const,
  list: (q: string) => ["conversations", "list", q] as const,
  unread: ["conversations", "unread"] as const,
  one: (id: number) => ["conversations", "one", id] as const,
  /** Outside the "conversations" root on purpose; see the note at the top. */
  messages: (id: number) => ["conversation-thread", id] as const,
  reservation: (reservationId: number) => ["conversations", "reservation", reservationId] as const,
};

export function useConversations(q = "") {
  return useInfiniteQuery({
    queryKey: conversationKeys.list(q),
    queryFn: ({ pageParam }) =>
      apiRaw<ConversationListPage>("/conversations", { query: { q: q || undefined, before: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: (prev) => prev,
  });
}

/** Unread messages across every conversation, for the rail badge. */
export function useUnreadMessageCount(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: conversationKeys.unread,
    queryFn: () => api<{ count: number }>("/conversations/unread").then((r) => r.count),
    staleTime: 30_000,
    ...opts,
  });
}

/** A refusal (left, deleted, another organization's) is final: show it, do not retry it. */
const retryUnlessRefused = (failures: number, error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 3;

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: conversationKeys.one(id ?? 0),
    queryFn: () => api<ConversationSummary>(`/conversations/${id}`),
    enabled: id != null,
    retry: retryUnlessRefused,
  });
}

/** A booking's conversation, or null when nobody has written on it yet (reading never makes one). */
export function useReservationConversation(reservationId: number | null, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: conversationKeys.reservation(reservationId ?? 0),
    queryFn: () => api<ConversationSummary | null>(`/conversations/reservation/${reservationId}`),
    enabled: reservationId != null && (opts?.enabled ?? true),
  });
}

/** Make a booking's conversation, just before its first message. Idempotent on the server. */
export function useStartReservationConversation(reservationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<ConversationSummary>(`/conversations/reservation/${reservationId}`, { method: "POST" }),
    onSuccess: (c) => qc.setQueryData(conversationKeys.reservation(reservationId), c),
  });
}

/**
 * The thread, newest page first in the cache; `fetchNextPage` loads OLDER history. Pages are
 * flattened oldest-first by `threadMessages` below.
 */
export function useConversationMessages(id: number | null) {
  return useInfiniteQuery({
    queryKey: conversationKeys.messages(id ?? 0),
    queryFn: ({ pageParam }) =>
      apiRaw<MessagesPage>(`/conversations/${id}/messages`, { query: { before: pageParam ?? undefined, limit: 50 } }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.hasMore && last.data.length ? last.data[0]!.id : null),
    enabled: id != null,
  });
}

export function threadMessages(data: InfiniteData<MessagesPage> | undefined) {
  if (!data) return { messages: [] as ConversationMessage[], authors: {} as MessagesPage["authors"] };
  const pages = [...data.pages].reverse();
  const authors: MessagesPage["authors"] = {};
  for (const p of pages) Object.assign(authors, p.authors);
  // A page refetched while a message arrived can overlap the next: keep one of each id.
  const seen = new Set<number>();
  const messages: ConversationMessage[] = [];
  for (const p of pages) for (const m of p.data) if (!seen.has(m.id)) (seen.add(m.id), messages.push(m));
  return { messages, authors };
}

export function useSendMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; clientId: string; attachmentIds?: number[]; replyToId?: number | null }) =>
      api<ConversationMessage>(`/conversations/${conversationId}/messages`, { method: "POST", body: input }),
    onSuccess: (m) => {
      putInThread(qc, conversationId, [m]);
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      void qc.invalidateQueries({ queryKey: ["conversations", "reservation"] });
    },
  });
}

type ThreadData = InfiniteData<MessagesPage, number | null>;

/**
 * Fold `incoming` into a cached thread: a message already there is replaced when it changed
 * (an edit, a delete), a new one joins the newest page in id order. Returns the same object
 * when nothing changed, so nothing re-renders.
 */
export function mergeIntoThread(
  data: ThreadData | undefined,
  incoming: ConversationMessage[],
  authors: MessagesPage["authors"] = {}
): ThreadData | undefined {
  if (!data || !data.pages.length || !incoming.length) return data;
  const byId = new Map(incoming.map((m) => [m.id, m]));
  let changed = false;
  const pages = data.pages.map((p) => {
    let pageChanged = false;
    const next = p.data.map((m) => {
      const n = byId.get(m.id);
      if (!n) return m;
      byId.delete(m.id);
      if (sameMessage(m, n)) return m;
      pageChanged = true;
      return n;
    });
    if (!pageChanged) return p;
    changed = true;
    return { ...p, data: next };
  });
  const fresh = [...byId.values()];
  const newAuthors = Object.keys(authors).some((k) => !(k in pages[0]!.authors));
  if (fresh.length || newAuthors) {
    changed = true;
    const p0 = pages[0]!;
    pages[0] = { ...p0, data: [...p0.data, ...fresh].sort((a, b) => a.id - b.id), authors: { ...p0.authors, ...authors } };
  }
  return changed ? { ...data, pages } : data;
}

/**
 * Whether two copies of a message draw the same. A reaction, a quote whose original was edited,
 * or a booking card whose status moved all change a message without touching its words.
 */
function sameMessage(a: ConversationMessage, b: ConversationMessage): boolean {
  return (
    a.body === b.body &&
    a.editedAt === b.editedAt &&
    a.deletedAt === b.deletedAt &&
    JSON.stringify(a.reactions ?? []) === JSON.stringify(b.reactions ?? []) &&
    JSON.stringify(a.replyTo ?? null) === JSON.stringify(b.replyTo ?? null) &&
    JSON.stringify(a.refs) === JSON.stringify(b.refs)
  );
}

function putInThread(qc: QueryClient, conversationId: number, messages: ConversationMessage[], authors?: MessagesPage["authors"]) {
  qc.setQueryData<ThreadData>(conversationKeys.messages(conversationId), (old) => mergeIntoThread(old, messages, authors));
}

/**
 * Keep an open thread live without reloading it. Any refresh of the "conversations" root (a
 * socket event, a read receipt) fetches the newest page once and merges it; events that land
 * while that fetch runs coalesce into one more. If the newest page does not reach back to what
 * is cached (a long time offline), the thread is reloaded properly instead.
 */
export function useLiveThread(conversationId: number | null) {
  const qc = useQueryClient();
  // Caught up with what arrived while the thread was closed (nobody merges events then, and a
  // cached copy under 30 seconds old is shown without a refetch): true once the opening
  // catch-up below has landed, or at once when there was no cached copy to catch up.
  const [caughtUp, setCaughtUp] = useState(false);
  useEffect(() => {
    if (conversationId == null) return;
    let timer: number | undefined;
    let running = false;
    let again = false;
    let disposed = false;
    const run = async () => {
      if (running) return void (again = true);
      running = true;
      try {
        const page = await apiRaw<MessagesPage>(`/conversations/${conversationId}/messages`, { query: { limit: 50 } });
        if (disposed) return;
        const cached = qc.getQueryData<ThreadData>(conversationKeys.messages(conversationId));
        const newestCached = cached?.pages[0]?.data.at(-1)?.id ?? 0;
        const oldestFetched = page.data[0]?.id ?? 0;
        if (cached && page.hasMore && oldestFetched > newestCached) {
          void qc.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) });
        } else {
          putInThread(qc, conversationId, page.data, page.authors);
        }
      } catch {
        /* the next event, or reopening the conversation, tries again */
      } finally {
        running = false;
        if (again && !disposed) {
          again = false;
          void run();
        }
      }
    };
    if (qc.getQueryData(conversationKeys.messages(conversationId))) {
      void run().finally(() => !disposed && setCaughtUp(true));
    } else {
      setCaughtUp(true);
    }
    const unsubscribe = qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "invalidate" || e.query.queryKey[0] !== "conversations") return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), 50);
    });
    return () => {
      disposed = true;
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [conversationId, qc]);
  return caughtUp;
}

export function useMarkConversationRead(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) =>
      api<{ lastReadMessageId: number | null }>(`/conversations/${conversationId}/read`, { method: "POST", body: { messageId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: conversationKeys.unread });
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
  });
}

export function useMuteConversation(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (muted: boolean) => api(`/conversations/${conversationId}/mute`, { method: "POST", body: { muted } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

export function useOpenDirect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orgUserId: number) => api<ConversationSummary>("/conversations/direct", { method: "POST", body: { orgUserId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
  });
}

/** Member groups the reader may message (every group for the desk, else their own). */
export function useMemberGroups() {
  return useQuery({
    queryKey: ["conversations", "member-groups"],
    queryFn: () => api<MessageableGroup[]>("/conversations/member-groups"),
    staleTime: 60_000,
  });
}

/** Open a member group's conversation, starting it the first time. */
export function useOpenMemberGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: number) => api<ConversationSummary>(`/conversations/member-groups/${groupId}`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; orgUserIds: number[] }) =>
      api<ConversationSummary>("/conversations/group", { method: "POST", body: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["conversations", "list"] }),
  });
}

export function useEditMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; body: string }) =>
      api<ConversationMessage>(`/conversations/messages/${input.id}`, { method: "PATCH", body: { body: input.body } }),
    onSuccess: (m) => putInThread(qc, conversationId, [m]),
  });
}

/** Set your reaction (`emoji`), or with null take it back. The thread updates from the reply. */
export function useReactToMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; emoji: string | null }) =>
      api<{ message: ConversationMessage; authors: MessagesPage["authors"] }>(
        `/conversations/messages/${input.id}/reaction`,
        input.emoji ? { method: "PUT", body: { emoji: input.emoji } } : { method: "DELETE" }
      ),
    onSuccess: (out) => putInThread(qc, conversationId, [out.message], out.authors),
  });
}

export function useDeleteMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<ConversationMessage>(`/conversations/messages/${id}`, { method: "DELETE" }),
    onSuccess: (m) => {
      putInThread(qc, conversationId, [m]);
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
    },
  });
}

export function useLeaveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: number) => api(`/conversations/${conversationId}/leave`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: conversationKeys.all }),
  });
}

/** Message words across the caller's conversations (2 characters or more), newest first. */
export function useMessageSearch(q: string) {
  const term = q.trim();
  return useInfiniteQuery({
    queryKey: ["conversations", "search", term],
    queryFn: ({ pageParam }) =>
      apiRaw<MessageSearchPage>("/conversations/search", { query: { q: term, before: pageParam ?? undefined } }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: term.length >= 2,
    placeholderData: (prev) => prev,
  });
}

/**
 * Write the change into the cached conversation too. Opening a conversation shows the cached copy
 * first while it refetches, and the thread decides on that first copy whether opening it clears
 * "mark as unread", so a stale copy would leave the mark in place.
 */
function setCachedConversation(qc: QueryClient, id: number, patch: Partial<ConversationSummary>) {
  qc.setQueryData<ConversationSummary>(conversationKeys.one(id), (old) => (old ? { ...old, ...patch } : old));
}

/**
 * Editing a group (2026-10-18): its name, its people and its photo. Each change lands in the
 * conversation as a line ("Ann added Ben") from the server, and the socket refreshes the rest.
 */
export function useEditGroup(conversationId: number) {
  const qc = useQueryClient();
  const done = (c: ConversationSummary) => {
    qc.setQueryData(conversationKeys.one(conversationId), c);
    void qc.invalidateQueries({ queryKey: conversationKeys.all });
  };
  const rename = useMutation({
    mutationFn: (title: string) => api<ConversationSummary>(`/conversations/${conversationId}`, { method: "PATCH", body: { title } }),
    onSuccess: done,
  });
  const add = useMutation({
    mutationFn: (orgUserIds: number[]) => api<ConversationSummary>(`/conversations/${conversationId}/participants`, { method: "POST", body: { orgUserIds } }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (orgUserId: number) => api<ConversationSummary>(`/conversations/${conversationId}/participants/${orgUserId}`, { method: "DELETE" }),
    onSuccess: done,
  });
  const photo = useMutation({
    mutationFn: async (file: File | null) => {
      if (!file) return api<ConversationSummary>(`/conversations/${conversationId}/photo`, { method: "PATCH", body: { url: null } });
      const presigned = await api<PresignedPost>(`/conversations/${conversationId}/photo/signedUrl?contentType=${encodeURIComponent(file.type)}`);
      await uploadToPresignedPost(presigned, file);
      return api<ConversationSummary>(`/conversations/${conversationId}/photo`, { method: "PATCH", body: { url: presignedObjectUrl(presigned) } });
    },
    onSuccess: done,
  });
  return { rename, add, remove, photo };
}

export function usePinConversation(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (pinned: boolean) => api(`/conversations/${conversationId}/pin`, { method: "POST", body: { pinned } }),
    onSuccess: (_r, pinned) => {
      setCachedConversation(qc, conversationId, { pinned });
      void qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

export function useMarkUnread(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (unread: boolean) => api(`/conversations/${conversationId}/unread`, { method: "POST", body: { unread } }),
    onSuccess: (_r, unread) => {
      setCachedConversation(qc, conversationId, { markedUnread: unread });
      void qc.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

/**
 * Who else is typing in a conversation, for the dots. Refetched when the socket says the typing
 * list changed (its own root, outside "conversations"), and again a few seconds on while anybody
 * is, so dots never outlive someone who stopped without saying so.
 */
export function useWhoIsTyping(conversationId: number) {
  return useQuery({
    queryKey: ["conversation-typing", conversationId],
    queryFn: () => api<ConversationPerson[]>(`/conversations/${conversationId}/typing`),
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? 3000 : false),
    staleTime: 0,
  });
}

/**
 * Tell the others you are typing: at most every 3 seconds while the box has words, and once
 * when it empties. Never throws; typing is a courtesy, not something to report failing.
 */
export function useTypingSignal(conversationId: number | null) {
  const last = useRef(0);
  const on = useRef(false);
  return useCallback(
    (typing: boolean) => {
      if (conversationId == null) return;
      const now = Date.now();
      if (typing && on.current && now - last.current < 3000) return;
      if (!typing && !on.current) return;
      on.current = typing;
      last.current = now;
      void api(`/conversations/${conversationId}/typing`, { method: "POST", body: { typing } }).catch(() => undefined);
    },
    [conversationId]
  );
}
