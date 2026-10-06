import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { WhatsNewEvent, WhatsNewFeed, WhatsNewPerson, WhatsNewStat, WhatsNewSurface } from "@/types/whats-new";

const KEY = ["whats-new"] as const;

/** The updates for the caller's roles, and which one the rail card shows. `GET /whats-new`. */
export function useWhatsNew(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api<WhatsNewFeed>("/whats-new", { query: { platform: "web" } }),
    // Updates ship with a deploy, a few a month. No reason to ask more than this.
    staleTime: 10 * 60_000,
    ...opts,
  });
}

/**
 * Report what the person did with an update. `POST /whats-new/:id/events`.
 *
 * Optimistic for the ones that change the screen, so the card goes the moment it is clicked. The server keeps the first time of each event, so a
 * repeat is harmless.
 */
export function useWhatsNewEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, event, surface }: { id: string; event: WhatsNewEvent; surface: WhatsNewSurface }) =>
      api(`/whats-new/${encodeURIComponent(id)}/events`, { method: "POST", body: { event, surface, platform: "web" } }),
    onMutate: ({ id, event, surface }) => {
      track(`whats_new_${event}`, { update_id: id, surface });
      if (event === "shown" || event === "action") return;
      // Opening it, closing it, or reading it on the public site all take the card away, and
      // opening or reading it marks it read: the same rules the server applies (`pickCard`).
      qc.setQueryData<WhatsNewFeed>(KEY, (feed) => {
        if (!feed) return feed;
        const entries = event !== "dismissed" ? feed.entries.map((e) => (e.id === id ? { ...e, read: true } : e)) : feed.entries;
        const retiredCard = feed.cardId === id;
        return {
          entries,
          cardId: retiredCard ? null : feed.cardId,
          unreadCount: entries.filter((e) => !e.read).length,
          waitingCount: retiredCard ? 0 : feed.waitingCount,
        };
      });
    },
    // Then ask the server, which knows whether that also changed what is waiting behind the card.
    // A card already on screen stays put (see `pickCard`), so this never yanks it away.
    onSettled: (_data, _err, { event }) => {
      if (event !== "shown" && event !== "action") void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/** Developer page: every update with its numbers. `GET /developer/whats-new`. */
export function useWhatsNewStats(enabled = true) {
  return useQuery({
    queryKey: ["developer", "whats-new"],
    queryFn: () => api<WhatsNewStat[]>("/developer/whats-new"),
    enabled,
  });
}

/** Developer page: who did what with one update. `GET /developer/whats-new/:id`. */
export function useWhatsNewPeople(id: string | null) {
  return useQuery({
    queryKey: ["developer", "whats-new", id],
    queryFn: () => api<WhatsNewPerson[]>(`/developer/whats-new/${encodeURIComponent(id!)}`),
    enabled: id != null,
  });
}
