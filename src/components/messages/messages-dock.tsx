import * as React from "react";
import { flushSync } from "react-dom";
import { useRouter } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, Maximize2, MessageCircle, MessagesSquare, Minimize2, Search, SquarePen } from "lucide-react";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useConversation, useConversations, useUnreadMessageCount } from "@/features/messages";
import type { ConversationSummary } from "@/types/messages";
import { DETAIL_PANEL_WIDTH, useDetailPanelDocked } from "@/components/detail-panel";
import { useMediaQuery } from "@/hooks/use-mobile";
import { Thread } from "@/components/messages/thread";
import { ComposeView } from "@/components/messages/compose-view";
import { ConversationMenuItems } from "@/components/messages/conversation-menu";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { ConversationGlyph, ConversationRow, ConversationTitle, MESSAGES_EMPTY, MessagesWorkspace } from "@/components/messages/messages-page";
import { MessageSearchResults } from "@/components/messages/message-search";

//---------------------------------------------------------------------------------
// Messages in the console (2026-10-16). Three states, one place:
//
//   closed     a launcher in the bottom-right corner of every page
//   open       a floating panel over the page: the list, a conversation, or a new message.
//              A mention clicked inside opens the record on the page behind; the panel stays.
//   expanded   the same panel, bigger (up to 1080 by 860), with the list and the conversation
//              side by side; from the panel's Expand or a /messages link. Desktop only: a phone's
//              panel is already the whole screen, so there "expanded" is just the panel.
//              (It was a 90% modal for a day; Tony: its close button added a whole column.)
//
// There is no Messages page; routes/_authed/messages*.tsx only open the expanded panel.
//
// Moving between the three MORPHS: the launcher and the panel carry the view-transition-name
// `messages-surface` (only one is on screen at a time), and every change of state runs inside
// document.startViewTransition, so the browser grows the launcher into the panel, the panel
// into its bigger self, and back. The motion is in index.css. Without View
// Transitions, or with reduced motion, the change is simply instant.
//---------------------------------------------------------------------------------

/**
 * The surface's transition name, through a custom property: while a screen slides inside
 * Messages (`html[data-messages-nav]`, styles.css sets it to `none`), the surface is not a
 * transition group of its own, so the panel holds still instead of cross-fading with
 * itself (it read as the whole panel refreshing on every conversation you picked).
 */
const SURFACE = "var(--messages-surface-name, messages-surface)";

/**
 * Moving between screens INSIDE Messages slides: forward (list to a conversation or a new
 * message) pushes in from the right, back pops out to the right, and swapping one conversation
 * for another cross-fades. Whatever carries `data-messages-screen` is the screen; it is only
 * named for the transition while `html[data-messages-nav]` is set, so a launcher-to-panel morph
 * moves it with the panel instead of on its own.
 */
type Nav = "forward" | "back" | "swap";
function slide(nav: Nav, update: () => void) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof document.startViewTransition !== "function" || reduce) return update();
  const root = document.documentElement;
  root.dataset.messagesNav = nav;
  const t = document.startViewTransition(update);
  void t.finished.finally(() => {
    if (root.dataset.messagesNav === nav) delete root.dataset.messagesNav;
  });
}

/**
 * Run a state change as a morph. `update` must change the DOM synchronously (flushSync) or
 * return a promise that settles once it has; the browser animates from before to after.
 */
function morph(update: () => void | Promise<void>) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (typeof document.startViewTransition !== "function" || reduce) {
    void update();
    return;
  }
  document.startViewTransition(async () => {
    await update();
  });
}

/**
 * The in-app path a click follows in this tab (the router will navigate), or null. A click
 * meant for a new tab or window, or an outside link, does not count.
 */
function followsInAppLink(e: React.MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.origin !== window.location.origin) return null;
  return a.pathname + a.search + a.hash;
}

/** The expanded panel's width; toasts step left of it, so it leaves them 26rem, but it is never
 *  narrower than the normal panel (at 800px wide, the 26rem alone made it SMALLER). */
const EXPANDED_W = "max(380px, min(1080px, calc(100vw - 26rem)))";
/** The closed launcher's diameter (`size-12`); toasts sit just left of it. */
const LAUNCHER_SIZE = "48px";

/** Below Tailwind's `md`, where the open panel takes the whole screen. */
const isPhone = () => typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;

/** -1 is the new-message view, wherever a conversation id goes. */
export const COMPOSE_ID = -1;

type DockState = { open: boolean; expanded: boolean; conversationId: number | null };

/** Closed, keeping the conversation you had open; an unsent new message is dropped. */
const closed = (s: DockState): DockState => ({
  open: false,
  expanded: false,
  conversationId: s.conversationId === COMPOSE_ID ? null : s.conversationId,
});

type DockCtx = {
  /** Open Messages: the panel, or with `expanded` the bigger panel; on one conversation or the list. */
  openMessages: (conversationId?: number | null, opts?: { expanded?: boolean }) => void;
  closeMessages: () => void;
};

const Ctx = React.createContext<DockCtx | null>(null);

/**
 * ON A PHONE THE KEYBOARD MUST NOT COVER THE COMPOSER. The panel is `fixed; inset: 0`, sized to
 * the layout viewport, and iOS Safari opens the keyboard OVER the layout viewport (only the
 * visual viewport shrinks), so the field you were typing in sat under the keys with Send out of
 * reach. While on a phone, this sizes the panel to the visual viewport instead: its top at the
 * viewport's offset (Safari scrolls the page to reveal a focused field) and its height the part
 * of the screen the keyboard leaves, so the composer rides on top of the keyboard. Chrome on
 * Android resizes for the keyboard already, and there this is the same box.
 */
function useKeyboardBox(enabled: boolean): React.CSSProperties {
  const [box, setBox] = React.useState<{ top: number; height: number } | null>(null);
  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!enabled || !vv) {
      setBox(null);
      return;
    }
    const update = () => {
      // Only while the keyboard (or anything) has taken part of the screen: at full height the
      // class's inset: 0 is already right, and leaving it alone keeps the morph's geometry.
      const covered = window.innerHeight - vv.height > 1;
      setBox(covered ? { top: vv.offsetTop, height: vv.height } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [enabled]);
  return box ? { top: box.top, height: box.height, bottom: "auto" } : {};
}

/** Open Messages from anywhere in the console ("Message" on a person, a /messages link). */
export function useMessagesDock(): DockCtx {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useMessagesDock must be used inside <MessagesDockProvider>");
  return ctx;
}

/**
 * Where Messages was, per membership (person in an organization), so a reload keeps the
 * conversation you had open, and switching organization or demo role never reopens somebody
 * else's (it did: the key was one per tab). Never a half-written new message.
 */
const storageKey = (orgUserId: number | null) => `messagesDock:${orgUserId ?? "none"}`;

function readSaved(key: string): DockState {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as Partial<DockState>;
      const id = typeof v.conversationId === "number" && v.conversationId > 0 ? v.conversationId : null;
      return { open: v.open === true, expanded: v.expanded === true, conversationId: id };
    }
  } catch {
    /* storage blocked: start closed */
  }
  return { open: false, expanded: false, conversationId: null };
}

export function MessagesDockProvider({ children }: { children: React.ReactNode }) {
  const { orgUserId } = useAuth();
  const key = storageKey(orgUserId);
  const [state, setState] = React.useState<DockState>(() => readSaved(key));
  // A different membership (organization switch, demo role switch): its own saved place.
  const [loadedKey, setLoadedKey] = React.useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState(readSaved(key));
  }
  React.useEffect(() => {
    if (loadedKey !== key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* fine: Messages just forgets on reload */
    }
  }, [state, key, loadedKey]);

  const value = React.useMemo<DockCtx>(
    () => ({
      openMessages: (conversationId, opts) =>
        morph(() =>
          flushSync(() =>
            setState({ open: !opts?.expanded, expanded: opts?.expanded === true, conversationId: conversationId ?? null })
          )
        ),
      closeMessages: () => morph(() => flushSync(() => setState(closed))),
    }),
    []
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <MessagesDock state={state} setState={setState} />
    </Ctx.Provider>
  );
}

function MessagesDock({ state, setState }: { state: DockState; setState: React.Dispatch<React.SetStateAction<DockState>> }) {
  const router = useRouter();
  const panelDocked = useDetailPanelDocked();
  const wide = useMediaQuery("(min-width: 768px)");
  const showPanel = state.open || state.expanded;
  // Expanded is a desktop size; a phone's panel is the whole screen already.
  const big = state.expanded && wide;
  // A docked record owns the right-hand column; the dock moves to its left rather than
  // covering the record's own footer button.
  const right = panelDocked ? `calc(${DETAIL_PANEL_WIDTH} + 1.5rem)` : "1.5rem";
  // Toasts stay clear of Messages, read by the Toaster in routes/__root.tsx. Open: to the
  // panel's left on a desktop, above its composer on a phone (the panel is the whole screen
  // there). Closed: BESIDE the launcher on a desktop, bottoms lined up, not stacked on top of
  // it (Tony: a toast above the chat button looked odd); a phone keeps them above it, since
  // its toasts run the full width.
  React.useEffect(() => {
    const root = document.documentElement.style;
    if (showPanel) {
      root.setProperty("--dock-toast-right", `calc(${right} + ${big ? EXPANDED_W : "380px"} + 12px)`);
      root.setProperty("--dock-toast-bottom-mobile", "96px");
    } else {
      root.setProperty("--dock-toast-right", `calc(${right} + ${LAUNCHER_SIZE} + 12px)`);
    }
    root.setProperty("--dock-toast-bottom", "24px");
    return () => {
      root.removeProperty("--dock-toast-right");
      root.removeProperty("--dock-toast-bottom");
      root.removeProperty("--dock-toast-bottom-mobile");
    };
  }, [showPanel, big, right]);

  const select = (id: number | null) => {
    if (id === state.conversationId) return;
    const nav: Nav = id == null ? "back" : state.conversationId == null ? "forward" : "swap";
    slide(nav, () => flushSync(() => setState((s) => ({ ...s, conversationId: id }))));
  };
  /** A change of state (launcher, panel, bigger panel), morphed. */
  const change = (next: (s: DockState) => DockState) => morph(() => flushSync(() => setState(next)));
  /**
   * A link followed from inside: Messages steps to `next` and the page changes underneath, in
   * one morph. The router's own transition is off for this navigation (a second transition
   * would cancel ours), and a slow page gets 400ms before the animation goes on without it.
   */
  const leave = (href: string, next: (s: DockState) => DockState) =>
    morph(async () => {
      flushSync(() => setState(next));
      await Promise.race([router.navigate({ href, viewTransition: false }), new Promise((r) => setTimeout(r, 400))]);
    });

  return (
    // One custom property carries the right offset; below md the dock ignores it (a phone has
    // no docked record column, and the open panel takes the whole screen).
    <div style={{ ["--dock-right" as string]: right }}>
      {!showPanel && (
        <div
          style={{ viewTransitionName: SURFACE }}
          className="fixed bottom-4 right-4 z-40 rounded-full transition-[right] duration-200 ease-out motion-reduce:transition-none md:bottom-6 md:right-[var(--dock-right)]"
        >
          <Launcher onOpen={() => change((s) => ({ ...s, open: true }))} />
        </div>
      )}
      {showPanel && (
        <DockPanel
          expanded={big}
          conversationId={state.conversationId}
          onSelect={select}
          onExpand={() => change((s) => ({ ...s, open: false, expanded: true }))}
          onCollapse={() => change((s) => ({ ...s, open: true, expanded: false }))}
          onClose={() => change(closed)}
          // Bigger panel: go to the page, Messages back to its usual size on the same
          // conversation. Phone: the panel covers the page, so it closes to show it.
          onLeave={(href) => leave(href, big ? (s) => ({ ...closed(s), open: true }) : closed)}
        />
      )}
    </div>
  );
}

/**
 * The closed dock: a round chat button, and the unread count when there is one. Quiet on
 * purpose (Tony, 2026-10-17): not everybody uses Messages, and a "Messages" pill with faces in
 * the corner of every page was a standing interruption for them.
 */
function Launcher({ onOpen }: { onOpen: () => void }) {
  const unread = useUnreadMessageCount();
  const n = unread.data ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={n > 0 ? `Messages, ${n} unread` : "Messages"}
      title="Messages"
      className={cn(
        "relative flex size-12 items-center justify-center rounded-full border bg-background text-foreground shadow-[0_6px_20px_rgba(48,49,61,0.16)]",
        "transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <MessageCircle className="size-5" aria-hidden />
      {n > 0 && (
        <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground ring-2 ring-background">
          {n > 99 ? "99+" : n}
        </span>
      )}
    </button>
  );
}

function DockPanel({
  expanded,
  conversationId,
  onSelect,
  onExpand,
  onCollapse,
  onClose,
  onLeave,
}: {
  expanded: boolean;
  conversationId: number | null;
  onSelect: (id: number | null) => void;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onLeave: (href: string) => void;
}) {
  // Escape steps back: the bigger panel to its usual size; a conversation or a new message to
  // the list; the list to closed. Unless a popover or menu inside has it first.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      if (expanded) onCollapse();
      else if (conversationId != null) onSelect(null);
      else onClose();
    }
  };

  // Following a link (a mention, a profile) shows the page: the bigger panel steps back to its
  // usual size, and a phone's full-screen panel closes. A desktop's usual panel stays, the page
  // is beside it.
  const onClickCapture = (e: React.MouseEvent) => {
    const href = expanded || isPhone() ? followsInAppLink(e) : null;
    if (!href) return;
    e.preventDefault();
    onLeave(href);
  };

  const keyboardBox = useKeyboardBox(!useMediaQuery("(min-width: 768px)"));

  return (
    <section
      aria-label="Messages"
      onKeyDown={onKeyDown}
      onClickCapture={onClickCapture}
      style={{ viewTransitionName: SURFACE, ...keyboardBox }}
      className={cn(
        "fixed z-40 flex flex-col overflow-hidden bg-background",
        // A phone gets the whole screen, over the sticky top bar (z-50 too, so later in the DOM
        // wins; popovers portal later still and open above it). A desktop gets a floating panel.
        "max-md:inset-0 max-md:z-50",
        "transition-[right] duration-200 ease-out motion-reduce:transition-none md:bottom-6 md:right-[var(--dock-right)] md:rounded-[14px] md:border md:shadow-[0_16px_48px_rgba(48,49,61,0.2)]",
        expanded ? "md:h-[min(860px,calc(100svh-6rem))] md:w-[max(380px,min(1080px,calc(100vw-26rem)))]" : "md:h-[min(600px,calc(100svh-6rem))] md:w-[380px]"
      )}
      data-expanded={expanded || undefined}
    >
      {expanded ? (
        <div data-messages-screen className="flex min-h-0 flex-1 flex-col bg-background">
          <header className="flex shrink-0 items-center gap-1 border-b py-2.5 pl-4 pr-2">
            <h2 className="flex-1 text-[17px] font-semibold">Messages</h2>
            <IconButton label="Collapse" onClick={onCollapse}>
              <Minimize2 className="size-4" />
            </IconButton>
            <IconButton label="Minimize" onClick={onClose}>
              <ChevronDown className="size-4" />
            </IconButton>
          </header>
          <div className="flex min-h-0 flex-1 flex-col p-3">
            <MessagesWorkspace selectedId={conversationId} onSelect={onSelect} />
          </div>
        </div>
      ) : (
      <div data-messages-screen className="flex min-h-0 flex-1 flex-col bg-background">
        {conversationId == null ? (
          <DockList onSelect={onSelect} onExpand={onExpand} onClose={onClose} />
        ) : conversationId === COMPOSE_ID ? (
          <DockCompose onBack={() => onSelect(null)} onCreated={onSelect} onClose={onClose} />
        ) : (
          <DockThread id={conversationId} onBack={() => onSelect(null)} onExpand={onExpand} onClose={onClose} />
        )}
      </div>
      )}
    </section>
  );
}

function IconButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {children}
    </button>
  );
}

function DockList({ onSelect, onExpand, onClose }: { onSelect: (id: number) => void; onExpand: () => void; onClose: () => void }) {
  const { orgUserId: me } = useAuth();
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const list = useConversations(q);
  const rows: ConversationSummary[] = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 py-2.5 pl-4 pr-2">
        <h2 className="flex-1 text-[17px] font-semibold">Messages</h2>
        <IconButton label="New message" onClick={() => onSelect(COMPOSE_ID)}>
          <SquarePen className="size-4" />
        </IconButton>
        <IconButton label="Expand" onClick={onExpand} className="max-md:hidden">
          <Maximize2 className="size-4" />
        </IconButton>
        <IconButton label="Minimize" onClick={onClose}>
          <ChevronDown className="size-4" />
        </IconButton>
      </header>
      <div className="shrink-0 px-3.5 pb-2.5">
        <label className="flex h-8 items-center gap-2 rounded-lg bg-muted px-2.5 text-muted-foreground">
          <Search className="size-3.5" aria-hidden />
          <span className="sr-only">Search conversations</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people and messages"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
      <ul role="list" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t">
        {list.isPending ? (
          <li className="px-4 py-6 text-sm text-muted-foreground">Loading…</li>
        ) : rows.length === 0 ? (
          q ? (
            <li className={cn("px-6 text-center text-sm text-muted-foreground", q.length >= 2 ? "py-4" : "py-10")}>No conversations match.</li>
          ) : (
            // AN EMPTY STATE IS A WAY IN, not a shrug (Tony: "empty states need to be super
            // helpful"): what Messages is for, and the button that starts one.
            <li>
              <EmptyState
                compact
                icon={MessagesSquare}
                title={MESSAGES_EMPTY.title}
                body={MESSAGES_EMPTY.body}
                action={<Button onClick={() => onSelect(COMPOSE_ID)}>New message</Button>}
                docs="messages"
              />
            </li>
          )
        ) : (
          rows.map((c) => (
            <li key={c.id}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    className="w-full px-3.5 py-2.5 text-left hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none data-[state=open]:bg-accent/50"
                  >
                    <ConversationRow c={c} me={me} />
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ConversationMenuItems c={c} me={me} />
                </ContextMenuContent>
              </ContextMenu>
            </li>
          ))
        )}
        {list.hasNextPage && (
          <li className="p-2">
            <button type="button" className="w-full rounded-md py-2 text-sm text-muted-foreground hover:bg-accent" onClick={() => list.fetchNextPage()}>
              Show older conversations
            </button>
          </li>
        )}
        <li>
          <MessageSearchResults q={q} onOpen={onSelect} />
        </li>
      </ul>
    </>
  );
}

function DockCompose({ onBack, onCreated, onClose }: { onBack: () => void; onCreated: (id: number) => void; onClose: () => void }) {
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b py-2 pl-1.5 pr-2">
        <IconButton label="Back to conversations" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </IconButton>
        <h2 className="flex-1 text-sm font-semibold">New message</h2>
        <IconButton label="Minimize" onClick={onClose}>
          <ChevronDown className="size-4" />
        </IconButton>
      </header>
      <ComposeView compact onCreated={onCreated} />
    </>
  );
}

function DockThread({ id, onBack, onExpand, onClose }: { id: number; onBack: () => void; onExpand: () => void; onClose: () => void }) {
  const { orgUserId: me } = useAuth();
  const q = useConversation(id);
  const c = q.data;
  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b py-2 pl-1.5 pr-2">
        <IconButton label="Back to conversations" onClick={onBack}>
          <ChevronLeft className="size-4" />
        </IconButton>
        {c ? (
          <>
            <ConversationGlyph c={c} me={me} />
            <ConversationTitle c={c} me={me} onLeft={onBack} compact />
          </>
        ) : (
          <p className="flex-1 truncate text-sm font-semibold">Conversation</p>
        )}
        <IconButton label="Expand" onClick={onExpand} className="max-md:hidden">
          <Maximize2 className="size-4" />
        </IconButton>
        <IconButton label="Minimize" onClick={onClose}>
          <ChevronDown className="size-4" />
        </IconButton>
      </header>
      {q.isError ? (
        <p className="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground">This conversation is not available.</p>
      ) : c ? (
        <Thread key={c.id} conversation={c} autoFocus />
      ) : (
        <p className="m-auto p-6 text-sm text-muted-foreground">Loading…</p>
      )}
    </>
  );
}
