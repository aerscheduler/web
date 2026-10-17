import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { apiRaw, api } from "@/lib/api";
import type {
  ConversationListPage,
  ConversationMessage,
  ConversationSummary,
  MessagesPage,
} from "@/types/messages";

//---------------------------------------------------------------------------------
// Messages (2026-10-16). Everything lives under the "conversations" root, which is also the
// one root the realtime `messages` channel invalidates: a new message for this member
// refetches their list, the badge and any open thread, over REST, where the read rules are.
//---------------------------------------------------------------------------------

export const conversationKeys = {
  all: ["conversations"] as const,
  list: (q: string) => ["conversations", "list", q] as const,
  unread: ["conversations", "unread"] as const,
  one: (id: number) => ["conversations", "one", id] as const,
  messages: (id: number) => ["conversations", "messages", id] as const,
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

export function useConversation(id: number | null) {
  return useQuery({
    queryKey: conversationKeys.one(id ?? 0),
    queryFn: () => api<ConversationSummary>(`/conversations/${id}`),
    enabled: id != null,
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
    mutationFn: (input: { body: string; clientId: string }) =>
      api<ConversationMessage>(`/conversations/${conversationId}/messages`, { method: "POST", body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) });
      void qc.invalidateQueries({ queryKey: ["conversations", "list"] });
      void qc.invalidateQueries({ queryKey: ["conversations", "reservation"] });
    },
  });
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
    onSuccess: () => void qc.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) }),
  });
}

export function useDeleteMessage(conversationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<ConversationMessage>(`/conversations/messages/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: conversationKeys.messages(conversationId) });
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
