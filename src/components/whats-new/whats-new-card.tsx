import * as React from "react";
import { ExternalLink, X } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useWhatsNew, useWhatsNewDismissAll, useWhatsNewEvent } from "@/features/whats-new";
import { ThemedImage } from "./whats-new-blocks";
import type { WhatsNewEntry } from "@/types/whats-new";
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
 *
 * Several updates waiting (someone back after a few weeks) draw ONE stacked card listing their
 * titles. Opening it shows the newest in the window with the rest marked New down the side, and
 * the × dismisses them all; either way the stack is gone, instead of a card per update to close
 * one after another (Tony, 2026-10-17).
 */
export function WhatsNewCard({ placement }: { placement: "floating" | "drawer" }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const feed = useWhatsNew();
  const event = useWhatsNewEvent();
  const dismissAll = useWhatsNewDismissAll();
  const entries = feed.data?.entries ?? [];
  const entry = entries.find((e) => e.id === feed.data?.cardId) ?? null;
  // The card and the updates waiting behind it. The server counts only updates that can still get
  // a card, so old news never joins the stack.
  const stack = (feed.data?.stackIds ?? []).map((id) => entries.find((e) => e.id === id)).filter((e) => e != null);
  const stacked = stack.length > 1;

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
    // The window lists the whole stack, still marked New; the card has done its job.
    if (stacked) dismissAll.mutate({ surface: "console_rail" });
  };
  const dismiss = () => {
    if (stacked) dismissAll.mutate({ surface: "console_rail" });
    else event.mutate({ id: entry.id, event: "dismissed", surface: "console_rail" });
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={stacked ? `What's new: ${stack.length} updates` : `What's new: ${entry.title}`}
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
        boxShadow: stacked
          ? "0 6px 0 -3px var(--popover), 0 6px 0 -2px var(--border), var(--sh-lg)"
          : "var(--sh-lg)",
      }}
    >
      <div className="-mt-1 -mr-1.5 mb-1.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          <span className="size-[7px] rounded-full bg-primary ring-[3px] ring-primary/20" aria-hidden />
          {stacked ? `What's new · ${stack.length} updates` : "What's new"}
          {!stacked && entry.draft && (
            <span className="rounded bg-warning/15 px-1 py-px text-[10px] tracking-normal text-warning normal-case">Draft</span>
          )}
        </span>
        <span className="flex">
          {!stacked && entry.readMore && (
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
            aria-label={stacked ? "Dismiss all" : "Dismiss"}
            title={stacked ? "Dismiss all" : "Dismiss"}
            data-testid="whats-new-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="grid size-[26px] place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </span>
      </div>
      {stacked ? (
        <StackList stack={stack} />
      ) : (
        <>
          <div className={cn("leading-snug font-semibold text-balance", placement === "floating" ? "text-[15px]" : "text-sm")}>
            {entry.title}
          </div>
          <div className="mt-1 text-[13px] leading-normal text-muted-foreground">{entry.summary}</div>
          {entry.hero && (
            <div className="mt-2.5 aspect-[2/1] overflow-hidden rounded-md border bg-muted">
              <ThemedImage image={entry.hero} className="size-full object-cover" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Titles shown on a stacked card before "and N more". */
const STACK_TITLES = 3;

/** The stacked card's body: the newest titles, then how many more the window holds. */
function StackList({ stack }: { stack: WhatsNewEntry[] }) {
  const shown = stack.slice(0, STACK_TITLES);
  const rest = stack.length - shown.length;
  return (
    <div>
      <ul className="flex flex-col gap-1.5">
        {shown.map((e, i) => (
          <li key={e.id} className="flex items-baseline gap-2 text-[13px] leading-snug">
            <span className="mt-[5px] size-[5px] shrink-0 rounded-full bg-muted-foreground/50" aria-hidden />
            <span className={cn("line-clamp-2 text-pretty", i === 0 ? "font-semibold" : "text-foreground/90")}>{e.title}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2.5 flex items-center justify-between text-[13px]">
        <span className="text-muted-foreground">{rest > 0 ? `${rest} more` : ""}</span>
        <span className="font-medium text-primary">See all</span>
      </div>
    </div>
  );
}
