import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, GripVertical, Pin, PinOff, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  NAV_VISIBLE_COUNT,
  isNavItemActive,
  mergeNavOrder,
  moveItem,
  operationsNav,
  pageForPath,
  youNav,
  type NavItem,
} from "@/lib/nav-items";
import {
  recordRecent,
  resetNavOrder,
  setNavOrder,
  setPinnedOrder,
  togglePinned,
  useNavPrefs,
} from "@/lib/nav-prefs";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * The left rail's body: pinned pages, the reorderable org bucket (five visible,
 * the rest under "More"), the personal section, and recently visited pages.
 *
 * Ordering and pinning are device-local preferences (see `lib/nav-prefs`), so
 * everything here is instant and never blocks paint on a request.
 */
export function SidebarNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles, organization } = useAuth();
  const orgId = organization?.id ?? null;
  const prefs = useNavPrefs(orgId);

  const operations = React.useMemo(() => operationsNav(roles), [roles]);
  const you = React.useMemo(() => youNav(roles), [roles]);
  const ordered = React.useMemo(
    () => mergeNavOrder(operations, prefs.order),
    [operations, prefs.order]
  );

  return (
    <>
      <PinnedGroup pinned={prefs.pinned} pathname={pathname} orgId={orgId} />
      <OperationsGroup
        items={ordered}
        customized={prefs.order.length > 0}
        pathname={pathname}
        orgId={orgId}
      />
      <PlainGroup label="You" items={you} pathname={pathname} />
      <RecentGroup
        recent={prefs.recent}
        pinned={prefs.pinned}
        onRail={[...ordered.slice(0, NAV_VISIBLE_COUNT), ...you].map((i) => i.to)}
        pathname={pathname}
        orgId={orgId}
      />
    </>
  );
}

/**
 * Remember where the user has been. Lives in the shell rather than the rail so
 * it keeps recording while the rail is closed (mobile) or scrolled away.
 */
export function useRecordRecentPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { organization } = useAuth();
  const orgId = organization?.id ?? null;

  React.useEffect(() => {
    const page = pageForPath(pathname);
    // Store the page's canonical path, not the URL: every sub-path of Settings
    // should read as one recent entry, not five near-identical ones.
    if (page) recordRecent(orgId, page.to);
  }, [pathname, orgId]);
}

// ── The org bucket ──────────────────────────────────────────────────────────

function OperationsGroup({
  items,
  customized,
  pathname,
  orgId,
}: {
  items: NavItem[];
  customized: boolean;
  pathname: string;
  orgId: number | null;
}) {
  const reorder = useReorder(items, (order) => setNavOrder(orgId, order));
  const [openMore, setOpenMore] = React.useState(false);
  const listRef = useFlipRows<HTMLUListElement>(reorder.dragKey);

  const { list, dragging } = reorder;
  const overflow = list.slice(NAV_VISIBLE_COUNT);
  // Never strand the page you're on behind a closed disclosure — a rail that
  // can't show you where you are is worse than one link too many.
  const activeInOverflow = overflow.some((i) => isNavItemActive(i.to, pathname));
  // Dragging alone does not open More — only hovering the More row (or an
  // explicit click) does, so the rail stays calm while reordering the top five.
  const expanded = openMore || activeInOverflow;

  if (list.length === 0) return null;

  return (
    <SidebarGroup className="group/nav-group">
      <SidebarGroupLabel>Operations</SidebarGroupLabel>
      {customized && (
        <SidebarGroupAction
          title="Reset to the default order"
          onClick={() => resetNavOrder(orgId)}
          className="opacity-0 transition-opacity group-hover/nav-group:opacity-70 focus-visible:opacity-100 hover:opacity-100"
        >
          <RotateCcw />
          <span className="sr-only">Reset nav order</span>
        </SidebarGroupAction>
      )}
      <SidebarGroupContent>
        <p className="sr-only">
          Drag a link to reorder it, or focus it and press Alt with the up and down arrow
          keys. The first {NAV_VISIBLE_COUNT} links stay visible; the rest move under More.
        </p>
        <SidebarMenu
          ref={listRef}
          onDragOver={(e) => reorder.isDragging() && e.preventDefault()}
        >
          {list.map((item, index) => (
            <React.Fragment key={item.to}>
              {index === NAV_VISIBLE_COUNT && (
                <MoreRow
                  expanded={expanded}
                  dragging={dragging}
                  onToggle={() => setOpenMore((o) => !o)}
                  onDragOver={() => {
                    setOpenMore(true);
                    reorder.over(NAV_VISIBLE_COUNT);
                  }}
                  isDragging={reorder.isDragging}
                />
              )}
              {(index < NAV_VISIBLE_COUNT || expanded) && (
                <NavRow
                  item={item}
                  active={isNavItemActive(item.to, pathname)}
                  reorder={reorder}
                  index={index}
                  indented={index >= NAV_VISIBLE_COUNT}
                />
              )}
            </React.Fragment>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * The line between "in your five" and "under More". Deliberately just another
 * row — same height, same rhythm, no rule or count beside it — so the rail reads
 * as one list whose tail happens to fold; only the chevron marks it as a
 * disclosure. It doubles as a drop target, so dragging a link across it is how
 * you promote or demote a page: the same gesture in both directions, with no
 * separate "add to nav" mode.
 */
function MoreRow({
  expanded,
  dragging,
  onToggle,
  onDragOver,
  isDragging,
}: {
  expanded: boolean;
  dragging: boolean;
  onToggle: () => void;
  onDragOver: () => void;
  /** Ref-backed: true as soon as dragstart runs, before deferred UI state paints. */
  isDragging: () => boolean;
}) {
  return (
    <SidebarMenuItem
      onDragOver={(e) => {
        if (!isDragging()) return;
        e.preventDefault();
        // Boundary target (not a list row) — drop onto the More index directly.
        onDragOver();
      }}
    >
      <SidebarMenuButton
        onClick={onToggle}
        aria-expanded={expanded}
        className={cn(dragging && "bg-sidebar-accent/60")}
      >
        <ChevronDown className={cn("transition-transform", !expanded && "-rotate-90")} />
        <span>More</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

// ── Pinned & recent ─────────────────────────────────────────────────────────

function PinnedGroup({
  pinned,
  pathname,
  orgId,
}: {
  pinned: string[];
  pathname: string;
  orgId: number | null;
}) {
  const items = React.useMemo(
    () => pinned.map(pageForPath).filter((p): p is NavItem => p != null),
    [pinned]
  );
  const reorder = useReorder(items, (order) => setPinnedOrder(orgId, order));
  const listRef = useFlipRows<HTMLUListElement>(reorder.dragKey);

  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu
          ref={listRef}
          onDragOver={(e) => reorder.isDragging() && e.preventDefault()}
        >
          {reorder.list.map((item, index) => (
            <NavRow
              key={item.to}
              item={item}
              active={isNavItemActive(item.to, pathname)}
              reorder={reorder}
              index={index}
              action={
                <SidebarMenuAction
                  showOnHover
                  title="Unpin"
                  onClick={() => togglePinned(orgId, item.to)}
                >
                  <PinOff />
                  <span className="sr-only">Unpin {item.label}</span>
                </SidebarMenuAction>
              }
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** How many recent pages the rail will show at once. */
const RECENT_SHOWN = 4;

/**
 * Recently visited pages — but only ones the rail isn't already showing.
 * Repeating Schedule back at someone two inches under the Schedule link is
 * noise; what earns the space is the page they had to dig for. That also makes
 * the pin affordance land where it's useful: the list is, by construction, the
 * shortlist of things worth promoting.
 */
function RecentGroup({
  recent,
  pinned,
  onRail,
  pathname,
  orgId,
}: {
  recent: string[];
  pinned: string[];
  onRail: string[];
  pathname: string;
  orgId: number | null;
}) {
  const items = React.useMemo(() => {
    const hidden = new Set([...pinned, ...onRail]);
    const current = pageForPath(pathname)?.to;
    return recent
      .filter((to) => !hidden.has(to) && to !== current)
      .map(pageForPath)
      .filter((p): p is NavItem => p != null)
      .slice(0, RECENT_SHOWN);
  }, [recent, pinned, onRail, pathname]);

  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Recent</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild className="text-sidebar-foreground/80">
                <Link to={item.to} draggable={false}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
              <SidebarMenuAction
                showOnHover
                title="Pin to the top of the nav"
                onClick={() => togglePinned(orgId, item.to)}
              >
                <Pin />
                <span className="sr-only">Pin {item.label}</span>
              </SidebarMenuAction>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** A fixed, non-reorderable section (the personal "You" links). */
function PlainGroup({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={isNavItemActive(item.to, pathname)}>
                <Link to={item.to} draggable={false}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

// ── Reordering ──────────────────────────────────────────────────────────────

type Reorder = ReturnType<typeof useReorder>;

const FLIP_MS = 180;

/**
 * FLIP the rows to their new positions instead of letting them teleport.
 *
 * Used for keyboard reorder (Alt+↑/↓). During an HTML5 drag we intentionally
 * do not animate: CSS transforms on siblings change hit-testing under the
 * cursor, so dragging upward (where the rows between old and new index slide
 * down through the pointer) oscillates — reorder → FLIP → different row under
 * cursor → reorder → flicker. Live draft order without transforms is stable.
 */
function useFlipRows<T extends HTMLElement>(
  dragging?: string | null
): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  const prev = React.useRef(new Map<string, DOMRect>());
  const draggingRef = React.useRef(dragging);
  draggingRef.current = dragging;

  // Layout effect, not effect: the correction has to be applied in the same
  // frame as the reorder, or the row is visibly painted in its new slot first.
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const next = new Map<string, DOMRect>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      // Clear any in-flight FLIP so a transform can't linger into a drag.
      if (draggingRef.current) {
        node.style.transition = "";
        node.style.transform = "";
      }
      next.set(node.dataset.flipKey!, node.getBoundingClientRect());
    }

    if (draggingRef.current) {
      // Keep the baseline in sync with the live draft so the first keyboard
      // move after a drag doesn't animate from a stale pre-drag rect.
      prev.current = next;
      return;
    }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    for (const node of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = node.dataset.flipKey!;
      // Rows with no previous box are new to the DOM (More just expanded);
      // sliding them in from a stale position would be worse than not moving.
      const was = prev.current.get(key);
      const box = next.get(key);
      if (!was || !box || reduced) continue;

      const dx = was.left - box.left;
      const dy = was.top - box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      node.style.transition = "none";
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      void node.offsetHeight; // flush, so the transition below has a start value
      node.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.2, 0, 0, 1)`;
      node.style.transform = "";
    }

    // Replaced wholesale rather than merged, so a row that unmounts and comes
    // back (More collapsed, then reopened) is treated as new.
    prev.current = next;
  });

  return ref;
}

/**
 * Drag-to-reorder over a list of nav items, using native HTML5 drag and drop —
 * a dependency-free fit for a dozen rows, where a full DnD toolkit would be
 * several times the size of the feature.
 *
 * The list previews the new order live in a local draft and only writes the
 * committed order on drop, so a drag across ten rows is one persisted change
 * rather than fifty.
 *
 * React state that restyles the drag source (opacity, More expand, FLIP) is
 * deferred one frame after dragstart — mutating the source synchronously
 * cancels the native drag in Chromium. Handlers read refs so the first
 * dragover after start still works in that gap.
 */
function useReorder(items: NavItem[], onCommit: (order: string[]) => void) {
  const { isMobile } = useSidebar();
  const [draft, setDraft] = React.useState<NavItem[] | null>(null);
  const [dragKey, setDragKey] = React.useState<string | null>(null);

  const draftRef = React.useRef<NavItem[] | null>(null);
  const dragKeyRef = React.useRef<string | null>(null);
  const itemsRef = React.useRef(items);
  const onCommitRef = React.useRef(onCommit);
  itemsRef.current = items;
  onCommitRef.current = onCommit;

  const list = draft ?? items;

  return {
    list,
    dragKey,
    dragging: dragKey !== null,
    isDragging: () => dragKeyRef.current !== null,
    // Touch has no HTML5 drag events, so don't advertise a gesture that can't
    // fire — the order still travels with the user from their desktop.
    enabled: !isMobile,
    start(to: string) {
      // Refs update synchronously so dragover can reorder before the deferred
      // paint; state waits a frame so the browser can claim the drag image.
      dragKeyRef.current = to;
      draftRef.current = itemsRef.current;
      requestAnimationFrame(() => {
        // Drag may already have ended (cancelled) before this frame.
        if (dragKeyRef.current !== to) return;
        setDragKey(to);
        // Don't clobber a draft `over` may have written in the same frame.
        setDraft((current) => current ?? draftRef.current);
      });
    },
    over(index: number, clientY?: number, rowTop?: number, rowHeight?: number) {
      const key = dragKeyRef.current;
      if (!key) return;
      setDraft((current) => {
        const base = current ?? itemsRef.current;
        const from = base.findIndex((i) => i.to === key);
        if (from === -1) return current;

        // Midpoint insertion: top half → before this row, bottom half → after.
        // Mapping the hovered row's index alone oscillates when moving up/down,
        // because the row under the cursor changes as soon as the draft shifts.
        let to = index;
        if (clientY != null && rowTop != null && rowHeight != null && rowHeight > 0) {
          const insertAt = clientY < rowTop + rowHeight / 2 ? index : index + 1;
          // moveItem removes `from` first, which shifts later slots down by one.
          to = from < insertAt ? insertAt - 1 : insertAt;
        }
        to = Math.max(0, Math.min(to, base.length - 1));
        if (from === to) return current;

        const next = moveItem(base, from, to);
        draftRef.current = next;
        return next;
      });
    },
    end() {
      const d = draftRef.current;
      const key = dragKeyRef.current;
      if (d && key) {
        const next = d.map((i) => i.to);
        const prev = itemsRef.current.map((i) => i.to);
        if (next.length !== prev.length || next.some((t, i) => t !== prev[i])) {
          onCommitRef.current(next);
        }
      }
      draftRef.current = null;
      dragKeyRef.current = null;
      setDraft(null);
      setDragKey(null);
    },
    /** Keyboard equivalent: Alt+↑/↓ on a focused link. */
    move(index: number, delta: number) {
      const to = index + delta;
      if (to < 0 || to >= items.length) return;
      onCommit(moveItem(items, index, to).map((i) => i.to));
    },
  };
}

function NavRow({
  item,
  active,
  index,
  reorder,
  action,
  indented,
}: {
  item: NavItem;
  active: boolean;
  index: number;
  reorder: Reorder;
  action?: React.ReactNode;
  /** Sits under "More" — inset with a guide line so it reads as belonging to it. */
  indented?: boolean;
}) {
  const dragging = reorder.dragKey === item.to;

  return (
    <SidebarMenuItem
      data-flip-key={item.to}
      draggable={reorder.enabled}
      onDragStart={(e) => {
        // Firefox refuses to start a drag without payload.
        e.dataTransfer.setData("text/plain", item.to);
        e.dataTransfer.effectAllowed = "move";
        reorder.start(item.to);
      }}
      onDragOver={(e) => {
        // Ref-backed: don't wait for the deferred dragstart paint.
        if (!reorder.isDragging()) return;
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        reorder.over(index, e.clientY, rect.top, rect.height);
      }}
      onDrop={(e) => e.preventDefault()}
      onDragEnd={reorder.end}
      onKeyDown={(e) => {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault();
        reorder.move(index, e.key === "ArrowUp" ? -1 : 1);
      }}
      className={cn(
        "transition-opacity",
        dragging && "opacity-40",
        reorder.enabled && "cursor-grab active:cursor-grabbing",
        // The hairline is bled 2px past each end to bridge the list's 4px gap,
        // so the run of overflow rows shows one continuous guide rather than a
        // dash beside each one.
        indented &&
          "pl-3.5 before:absolute before:-top-0.5 before:-bottom-0.5 before:left-1 before:w-px before:bg-sidebar-border before:content-['']"
      )}
    >
      <SidebarMenuButton asChild isActive={active}>
        {/* The anchor's own native drag would hand the browser a URL to drag
            around instead of letting the row reorder. */}
        <Link to={item.to} draggable={false}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
      {action ??
        (reorder.enabled && (
          <GripVertical
            aria-hidden
            className="pointer-events-none absolute top-2 right-1.5 size-3.5 text-sidebar-foreground/40 opacity-0 transition-opacity group-hover/menu-item:opacity-100"
          />
        ))}
    </SidebarMenuItem>
  );
}
