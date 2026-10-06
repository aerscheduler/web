import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useWhatsNew, useWhatsNewEvent } from "@/features/whats-new";
import type { WhatsNewEntry } from "@/types/whats-new";
import { ThemedImage, WhatsNewBlocks } from "./whats-new-blocks";
import { useWhatsNewWindow, whatsNewWindow } from "./whats-new-store";

/** The public changelog, every published update for every role. */
const CHANGELOG_URL = "https://www.aerscheduler.com/changelog";

/** Publish dates are UTC midnights; formatting in local time would show Oct 4 for an Oct 5 update. */
const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The What's new window: one update at a time with the whole story, recent updates down the
 * left. A centred dialog on a desktop, a drawer on a phone. Mounted once in the app shell and
 * opened through `whatsNewWindow` by the rail card, the organization menu and the developer page.
 */
export function WhatsNewWindowHost() {
  const { open, id, surface, preview } = useWhatsNewWindow();
  const feed = useWhatsNew({ enabled: open && !preview });
  const event = useWhatsNewEvent();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  const entries = preview ?? feed.data?.entries ?? [];
  const active = entries.find((e) => e.id === id) ?? entries[0] ?? null;

  // Which updates were unread when the window opened, so "New" stays on the one being read
  // instead of vanishing the moment opening it marks it read.
  const [unreadAtOpen, setUnreadAtOpen] = React.useState<Set<string>>(new Set());
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpen.current && entries.length) {
      setUnreadAtOpen(new Set(entries.filter((e) => !e.read).map((e) => e.id)));
      wasOpen.current = true;
    }
    if (!open) wasOpen.current = false;
  }, [open, entries]);

  // Opening an update is what counts as reading it. Once per update per opening of the window.
  const reported = React.useRef(new Set<string>());
  React.useEffect(() => {
    if (!open) {
      reported.current.clear();
      return;
    }
    if (!active || preview || reported.current.has(active.id)) return;
    reported.current.add(active.id);
    event.mutate({ id: active.id, event: "opened", surface });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active?.id, preview]);

  const onAction = (entry: WhatsNewEntry) => {
    if (!entry.action) return;
    if (!preview) event.mutate({ id: entry.id, event: "action", surface });
    whatsNewWindow.close();
    void navigate({ href: entry.action.to });
  };
  const onLink = (entry: WhatsNewEntry) => {
    if (!preview) event.mutate({ id: entry.id, event: "link", surface });
  };
  const onOpenChange = (next: boolean) => {
    if (!next) whatsNewWindow.close();
  };

  if (!active) {
    // Nothing for this person (or still loading): an empty window helps nobody.
    return null;
  }

  const article = <Article entry={active} isNew={unreadAtOpen.has(active.id)} />;
  const footer = <Footer entry={active} onAction={onAction} onLink={onLink} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]" data-doc-shot="whats-new-window">
          <DrawerTitle className="sr-only">What's new</DrawerTitle>
          <DrawerDescription className="sr-only">{active.title}</DrawerDescription>
          <div key={active.id} className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {article}
            {entries.length > 1 && (
              <div className="border-t px-5 pt-4 pb-6">
                <div className="mb-2 text-sm font-semibold">More updates</div>
                <UpdateList entries={entries} activeId={active.id} />
              </div>
            )}
          </div>
          {footer}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-doc-shot="whats-new-window"
        className="grid h-[min(760px,calc(100vh-3rem))] w-[min(1080px,calc(100vw-2rem))] max-w-none grid-cols-[248px_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <nav className="flex min-h-0 flex-col gap-0.5 border-r bg-muted/50 px-2.5 pt-3.5 pb-2.5" aria-label="Updates">
          <DialogTitle className="px-2.5 pt-1 pb-3 text-sm font-semibold">What's new</DialogTitle>
          <DialogDescription className="sr-only">Recent AerScheduler updates for your roles.</DialogDescription>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <UpdateList entries={entries} activeId={active.id} />
          </div>
          <a
            href={CHANGELOG_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
            See all updates
          </a>
        </nav>
        <div className="relative flex min-h-0 min-w-0 flex-col">
          <button
            type="button"
            onClick={() => whatsNewWindow.close()}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 grid size-[30px] place-items-center rounded-full border bg-card/85 text-foreground backdrop-blur-md transition-colors hover:bg-card"
          >
            <X className="size-4" />
          </button>
          <div key={active.id} className="min-h-0 flex-1 overflow-y-auto">
            {article}
          </div>
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UpdateList({ entries, activeId }: { entries: WhatsNewEntry[]; activeId: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => whatsNewWindow.select(e.id)}
          aria-current={e.id === activeId ? "true" : undefined}
          className={cn(
            "relative grid gap-px rounded-md py-2 pr-6 pl-2.5 text-left transition-colors hover:bg-muted",
            e.id === activeId && "bg-card shadow-[var(--sh-sm)] hover:bg-card"
          )}
        >
          <span className="text-xs text-muted-foreground tabular-nums">{shortDate.format(new Date(e.publishedAt))}</span>
          <span className="text-[13px] leading-snug font-medium">{e.title}</span>
          {!e.read && <span className="absolute top-3.5 right-2.5 size-[7px] rounded-full bg-primary" aria-label="Unread" />}
        </button>
      ))}
    </div>
  );
}

function Article({ entry, isNew }: { entry: WhatsNewEntry; isNew: boolean }) {
  return (
    <article>
      {entry.hero && (
        <div className="aspect-[2.4/1] overflow-hidden border-b bg-muted">
          <ThemedImage image={entry.hero} className="size-full object-cover" />
        </div>
      )}
      <div className="max-w-[720px] px-5 pt-5 pb-8 md:px-12 md:pt-7 md:pb-10">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {entry.draft && (
            <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">Draft</span>
          )}
          {isNew && !entry.draft && (
            <span className="rounded bg-primary/12 px-1.5 py-0.5 text-[11px] font-semibold text-primary">New</span>
          )}
          <span>{longDate.format(new Date(entry.publishedAt))}</span>
          <span aria-hidden>·</span>
          <span>{entry.audienceLabel}</span>
        </div>
        <h2 className="mt-2.5 text-2xl leading-tight font-semibold tracking-tight text-balance">{entry.title}</h2>
        <WhatsNewBlocks blocks={entry.blocks} />
      </div>
    </article>
  );
}

function Footer({
  entry,
  onAction,
  onLink,
}: {
  entry: WhatsNewEntry;
  onAction: (e: WhatsNewEntry) => void;
  onLink: (e: WhatsNewEntry) => void;
}) {
  if (!entry.action && !entry.readMore) return null;
  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-t bg-card px-4 py-3 md:pl-8">
      {entry.readMore ? (
        <Button variant="ghost" className="text-muted-foreground" asChild>
          <a href={entry.readMore} target="_blank" rel="noopener noreferrer" onClick={() => onLink(entry)}>
            Read the guide
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      ) : (
        <span />
      )}
      {entry.action && <Button onClick={() => onAction(entry)}>{entry.action.label}</Button>}
    </div>
  );
}
