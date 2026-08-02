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
  const listRef = useFlipRows<HTMLUListElement>();

  const { list, dragging } = reorder;
  const overflow = list.slice(NAV_VISIBLE_COUNT);
  // Never strand the page you're on behind a closed disclosure — a rail that
  // can't show you where you are is worse than one link too many.
  const activeInOverflow = overflow.some((i) => isNavItemActive(i.to, pathname));
  const expanded = openMore || dragging || activeInOverflow;

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
        <SidebarMenu ref={listRef} onDragOver={(e) => dragging && e.preventDefault()}>
          {list.map((item, index) => (
            <React.Fragment key={item.to}>
              {index === NAV_VISIBLE_COUNT && (
                <MoreRow
                  expanded={expanded}
                  dragging={dragging}
                  onToggle={() => setOpenMore((o) => !o)}
                  onDragOver={() => reorder.over(NAV_VISIBLE_COUNT)}
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
}: {
  expanded: boolean;
  dragging: boolean;
  onToggle: () => void;
  onDragOver: () => void;
}) {
  return (
    <SidebarMenuItem
      onDragOver={(e) => {
        if (!dragging) return;
        e.preventDefault();
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
  const listRef = useFlipRows<HTMLUListElement>();

  if (items.length === 0) return null;

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Pinned</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu ref={listRef} onDragOver={(e) => reorder.dragging && e.preventDefault()}>
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
 * Reordering swaps two rows in one frame, and without this the list snaps — you
 * lose track of which slot you're hovering, which is exactly the feedback a drag
 * needs. So: measure every row before the paint that moves it, invert the delta
 * as a transform, then let the transform transition away. Both axes, because a
 * row crossing the More boundary changes indent as well as height.
 */
function useFlipRows<T extends HTMLElement>(): React.RefObject<T | null> {
  const ref = React.useRef<T>(null);
  const prev = React.useRef(new Map<string, DOMRect>());

  // Layout effect, not effect: the correction has to be applied in the same
  // frame as the reorder, or the row is visibly painted in its new slot first.
  React.useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<string, DOMRect>();

    for (const node of root.querySelectorAll<HTMLElement>("[data-flip-key]")) {
      const key = node.dataset.flipKey!;
      const box = node.getBoundingClientRect();
      next.set(key, box);

      // Rows with no previous box are new to the DOM (More just expanded);
      // sliding them in from a stale position would be worse than not moving.
      const was = prev.current.get(key);
      if (!was || reduced) continue;

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
 */
function useReorder(items: NavItem[], onCommit: (order: string[]) => void) {
  const { isMobile } = useSidebar();
  const [draft, setDraft] = React.useState<NavItem[] | null>(null);
  const [dragKey, setDragKey] = React.useState<string | null>(null);

  const list = draft ?? items;

  return {
    list,
    dragKey,
    dragging: dragKey !== null,
    // Touch has no HTML5 drag events, so don't advertise a gesture that can't
    // fire — the order still travels with the user from their desktop.
    enabled: !isMobile,
    start(to: string) {
      setDragKey(to);
      setDraft(items);
    },
    over(index: number) {
      setDraft((current) => {
        const base = current ?? items;
        const from = base.findIndex((i) => i.to === dragKey);
        return from === -1 || from === index ? base : moveItem(base, from, index);
      });
    },
    end() {
      if (draft && dragKey) onCommit(draft.map((i) => i.to));
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
        if (!reorder.dragging) return;
        e.preventDefault();
        reorder.over(index);
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
