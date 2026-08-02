import {
  Bell,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  ChartColumnBig,
  Clock,
  CreditCard,
  FileText,
  Home,
  LayoutDashboard,
  Megaphone,
  MonitorPlay,
  PlaneTakeoff,
  Receipt,
  Settings,
  ShieldCheck,
  TerminalSquare,
  User as UserIcon,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type { Role } from "@/types/api";
import { canAccess, canSelfBook } from "@/lib/permissions";

export type NavIcon = typeof LayoutDashboard;
export type NavItem = { to: string; label: string; icon: NavIcon };

/**
 * Every org-level destination, as ONE flat bucket in its default order. There
 * used to be four micro-groups here (Operations / Money / Compliance /
 * Maintenance) — three of which held a single link, which reads as taxonomy
 * rather than navigation. The rail now shows the first five and tucks the rest
 * behind "More"; the split point is a position in this list, not a category, so
 * a user who drags Maintenance to the top simply gets it in their five.
 *
 * Order matters twice over: it is the out-of-the-box nav, and it is the fallback
 * position for any item a user hasn't explicitly placed (see `mergeNavOrder`).
 * Calendar and Reports sit together near the top — the board and the numbers
 * that follow from it — with Maintenance also in the visible five.
 */
const OPERATIONS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/schedule", label: "Calendar", icon: CalendarDays },
  { to: "/reports", label: "Reports", icon: ChartColumnBig },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/people", label: "People", icon: Users },
  { to: "/aircraft", label: "Aircraft", icon: PlaneTakeoff },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/compliance", label: "Go / No-Go", icon: ShieldCheck },
  { to: "/facilities", label: "Facilities", icon: MonitorPlay },
  { to: "/operations/announcements", label: "Announcements", icon: Megaphone },
  { to: "/operations/cancellations", label: "Cancellations", icon: CalendarX2 },
];

/**
 * The org bucket for these roles. Filtered through the same `canAccess`
 * (ROUTE_ACCESS) the route guards use, so the rail can never offer a link that
 * would bounce the user straight back out.
 */
export function operationsNav(roles: string[]): NavItem[] {
  return OPERATIONS.filter((item) => canAccess(item.to, roles as Role[]));
}

/**
 * The personal section — every member gets this, and it is deliberately NOT
 * reorderable or capped: it is short, and its whole value is that a pilot always
 * finds their own things in the same place. (Payment methods & availability live
 * as tabs under Profile, which the account menu at the foot of the rail owns.)
 */
export function youNav(roles: string[]): NavItem[] {
  const R = roles as Role[];
  return [
    { to: "/me", label: "Home", icon: Home },
    { to: "/me/schedule", label: "Schedule", icon: CalendarDays },
    // Only roles that can actually be seated on a booking — a pure dispatcher
    // books from the board, not here.
    ...(canSelfBook(R) ? [{ to: "/me/book", label: "Book", icon: CalendarPlus }] : []),
    { to: "/me/invoices", label: "Invoices", icon: Wallet },
    { to: "/me/currencies", label: "Currencies", icon: ShieldCheck },
    { to: "/me/documents", label: "Documents", icon: FileText },
  ];
}

/**
 * Destinations that never appear in the rail but that a user can land on and
 * want back quickly — this is most of what makes "Recent" worth having, since
 * the rail itself already holds the org pages.
 */
const OFF_RAIL: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/settings/integrations/quickbooks", label: "QuickBooks", icon: Receipt },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/me/profile", label: "Profile", icon: UserIcon },
  { to: "/me/notifications", label: "Notification settings", icon: Bell },
  { to: "/me/payment-methods", label: "Payment methods", icon: CreditCard },
  { to: "/me/availability", label: "Availability", icon: Clock },
  { to: "/developer", label: "Developer", icon: TerminalSquare },
];

/** Everything addressable, longest path first so prefix matching prefers the leaf. */
const ALL_PAGES: NavItem[] = [
  ...OPERATIONS,
  ...youNav(["owner", "instructor"]),
  ...OFF_RAIL,
].sort((a, b) => b.to.length - a.to.length);

/**
 * Resolve a pathname to the page it belongs to, so Recent can name it. Sub-paths
 * fold into their page (`/settings/integrations/quickbooks` is its own entry;
 * `/settings/billing` folds into Settings), and `/me` only matches exactly —
 * every personal page starts with it.
 */
export function pageForPath(pathname: string): NavItem | null {
  return (
    ALL_PAGES.find(
      (p) => p.to === pathname || (p.to !== "/me" && pathname.startsWith(`${p.to}/`))
    ) ?? null
  );
}

/** Is `pathname` on the page `to` owns? Mirrors `pageForPath`'s prefix rule. */
export function isNavItemActive(to: string, pathname: string): boolean {
  if (to === "/me") return pathname === "/me";
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Apply a user's saved order to the items they can actually see.
 *
 * Saved order is a list of paths, not the items themselves, so it survives roles
 * changing and pages coming and going. Anything the user has never placed —
 * a page we ship after they last dragged something — falls back to its default
 * position rather than being dumped at the end, which is what keeps a new
 * top-priority page from landing in "More" for every existing user.
 */
export function mergeNavOrder(items: NavItem[], order: string[]): NavItem[] {
  if (order.length === 0) return items;

  const placed = order.filter((to) => items.some((i) => i.to === to));
  const rest = items.filter((i) => !placed.includes(i.to));
  const merged = placed.map((to) => items.find((i) => i.to === to)!);

  // Re-insert unplaced items at their default index, so their neighbours are the
  // ones we shipped them next to.
  for (const item of rest) {
    const defaultIndex = items.indexOf(item);
    const before = items.slice(0, defaultIndex).map((i) => i.to);
    const at = merged.findIndex((i) => !before.includes(i.to));
    merged.splice(at === -1 ? merged.length : at, 0, item);
  }
  return merged;
}

/** Immutably move `from` → `to` in an array. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list;
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.min(to, next.length), 0, moved!);
  return next;
}

/** How many org links show before "More" takes over. */
export const NAV_VISIBLE_COUNT = 5;
