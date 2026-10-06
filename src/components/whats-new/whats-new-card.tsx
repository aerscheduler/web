import * as React from "react";
import { ExternalLink, X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useWhatsNew, useWhatsNewEvent } from "@/features/whats-new";
import { ThemedImage } from "./whats-new-blocks";
import { whatsNewWindow } from "./whats-new-store";

/** "shown" once per update per page load; the server keeps the first anyway. */
const shownThisLoad = new Set<string>();

/**
 * The What's new card. On a desktop it floats over the bottom-left corner of the window, across
 * the foot of the rail and the page (Tony chose this over docking it in the rail, 2026-10-06), so
 * its width never depends on the rail's. On a phone it sits at the bottom of the menu drawer
 * instead, where floating would cover the page. The arrow opens the public page in a new tab, the
 * × hides it for good (on the console and the app), and anywhere else opens the window. The server
 * decides which update, if any, gets the card (`pickCard`); this only draws it.
 */
export function WhatsNewCard({ placement }: { placement: "floating" | "drawer" }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const feed = useWhatsNew();
  const event = useWhatsNewEvent();
  const entries = feed.data?.entries ?? [];
  const entry = entries.find((e) => e.id === feed.data?.cardId) ?? null;
  // Another card still to come shows as an edge peeking out underneath. The server counts only
  // updates that can still get a card, so old news never fakes one.
  const more = (feed.data?.waitingCount ?? 0) > 0;

  React.useEffect(() => {
    if (!entry || shownThisLoad.has(entry.id)) return;
    shownThisLoad.add(entry.id);
    event.mutate({ id: entry.id, event: "shown", surface: "console_rail" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  if (!entry) return null;
  if ((placement === "floating") === isMobile) return null;

  const open = () => {
    // The rail is a drawer on a phone; leave it open under the window and it covers the page after.
    if (isMobile) setOpenMobile(false);
    whatsNewWindow.open(entry.id, "console_rail");
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`What's new: ${entry.title}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      data-testid="whats-new-card"
      className={cn(
        "cursor-pointer rounded-[10px] border bg-popover p-3 text-left text-popover-foreground transition-[transform,border-color] duration-150 outline-none hover:-translate-y-px hover:border-input focus-visible:ring-[3px] focus-visible:ring-ring/50",
        placement === "floating"
          ? "fixed bottom-4 left-4 z-40 w-[320px] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
          : "relative"
      )}
      style={{
        boxShadow: more
          ? "0 6px 0 -3px var(--popover), 0 6px 0 -2px var(--border), var(--sh-lg)"
          : "var(--sh-lg)",
      }}
    >
      <div className="-mt-1 -mr-1.5 mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          <span className="size-[7px] rounded-full bg-primary ring-[3px] ring-primary/20" aria-hidden />
          What's new
          {entry.draft && (
            <span className="rounded bg-warning/15 px-1 py-px text-[10px] tracking-normal text-warning normal-case">Draft</span>
          )}
        </span>
        <span className="flex">
          {entry.readMore && (
            <a
              href={entry.readMore}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on aerscheduler.com"
              title="Open on aerscheduler.com"
              onClick={(e) => {
                e.stopPropagation();
                event.mutate({ id: entry.id, event: "link", surface: "console_rail" });
              }}
              className="grid size-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="size-3.5" />
            </a>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              event.mutate({ id: entry.id, event: "dismissed", surface: "console_rail" });
            }}
            className="grid size-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
      <div className={cn("leading-snug font-semibold text-balance", placement === "floating" ? "text-[15px]" : "text-sm")}>
        {entry.title}
      </div>
      <div className="mt-1 text-[13px] leading-normal text-muted-foreground">{entry.summary}</div>
      {entry.hero && (
        <div className="mt-2.5 aspect-[2/1] overflow-hidden rounded-md border bg-muted">
          <ThemedImage image={entry.hero} className="size-full object-cover" />
        </div>
      )}
    </div>
  );
}
