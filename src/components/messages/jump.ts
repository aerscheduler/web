//---------------------------------------------------------------------------------
// "Open this conversation AT this message" (2026-10-18): a search hit opens the conversation
// and the thread, once it has loaded, pages back until that message is in view, scrolls to it
// and flashes it. A request waits here, keyed by conversation, until that thread takes it.
//---------------------------------------------------------------------------------

const pending = new Map<number, number>();

const listeners = new Set<(conversationId: number) => void>();

export function requestJump(conversationId: number, messageId: number) {
  pending.set(conversationId, messageId);
  // A thread already open on that conversation takes it now (opening it again mounts nothing).
  for (const l of listeners) l(conversationId);
}

/** Hear about jump requests while mounted. Returns the unsubscribe. */
export function onJumpRequest(listener: (conversationId: number) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The message a thread should open at, once; null when nobody asked. */
export function takeJump(conversationId: number): number | null {
  const id = pending.get(conversationId) ?? null;
  pending.delete(conversationId);
  return id;
}
