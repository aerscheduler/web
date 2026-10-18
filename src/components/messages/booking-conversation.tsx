import * as React from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { conversationKeys, useReservationConversation, useStartReservationConversation } from "@/features/messages";
import { DetailCard } from "@/components/detail/detail-page";
import { Skeleton } from "@/components/ui/skeleton";
import { Thread } from "@/components/messages/thread";
import { Composer } from "@/components/messages/composer";
import { DocsHint } from "@/components/docs-hint";

/**
 * A booking's conversation, on the booking's own page.
 *
 * Everyone on the booking and the organization's staff can read it; the people on the booking
 * hear about new messages. Nothing exists until somebody writes, so an untouched booking shows
 * the box to write in and no thread.
 */
export function BookingConversation({ reservationId }: { reservationId: number }) {
  const q = useReservationConversation(reservationId);
  const start = useStartReservationConversation(reservationId);
  const qc = useQueryClient();
  const [sending, setSending] = React.useState(false);

  const first = async (body: string, attachmentIds: number[] = []) => {
    setSending(true);
    try {
      const c = await start.mutateAsync();
      await api(`/conversations/${c.id}/messages`, { method: "POST", body: { body, clientId: crypto.randomUUID(), attachmentIds } });
      await qc.invalidateQueries({ queryKey: conversationKeys.all });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That message didn't send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <DetailCard
      title="Conversation"
      description="Everyone on this booking and your organization's staff can read this."
      action={<DocsHint topic="messages" />}
      bodyClassName="p-0"
    >
      {q.isPending ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-9 w-56 rounded-[18px]" />
          <Skeleton className="ml-auto h-9 w-40 rounded-[18px]" />
        </div>
      ) : q.data ? (
        <div className="flex h-[28rem] flex-col">
          <Thread conversation={q.data} />
        </div>
      ) : (
        <div className="px-4 pb-4 pt-1">
          <p className="pb-3 text-[13px] text-muted-foreground">No messages yet. Coordinate the lesson, the fuel or the keys here.</p>
          <Composer placeholder="Message everyone on this booking" onSend={first} disabled={sending} />
        </div>
      )}
    </DetailCard>
  );
}
