import {
  Bell,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  ChartColumnBig,
  Clock,
  CreditCard,
  FileText,
  GraduationCap,
  Home,
  LayoutDashboard,
  Megaphone,
  MonitorPlay,
  PlaneTakeoff,
  Receipt,
  ScrollText,
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
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

export type NavIcon = typeof LayoutDashboard;
export type NavItem = {
  to: string;
  label: string;
  icon: NavIcon;
  /**
   * Other words for this page, for the command palette only — the rail never reads them.
   *
   * They exist because people search for what a page DOES, not what the tab is called:
   * "go no go" finds Compliance, "syllabus" finds Training, "squawk" finds Maintenance.
   * A page with no keywords is only findable by its own label, which for half this list
   * is a word the searcher would have to already know.
   */
  keywords?: string[];
};

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
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: ["home", "overview", "today"] },
  {
    to: "/schedule",
    label: "Calendar",
    icon: CalendarDays,
    keywords: ["schedule", "flights", "bookings", "reservations", "ramp", "board", "dispatch"],
  },
  {
    to: "/reports",
    label: "Reports",
    icon: ChartColumnBig,
    keywords: ["utilization", "revenue", "metrics", "analytics", "saved views"],
  },
  {
    to: "/maintenance",
    label: "Maintenance",
    icon: Wrench,
    keywords: ["squawks", "defects", "grounded", "inspections", "reminders"],
  },
  { to: "/people", label: "People", icon: Users, keywords: ["members", "roster", "students", "instructors", "renters"] },
  { to: "/aircraft", label: "Aircraft", icon: PlaneTakeoff, keywords: ["planes", "fleet", "resources", "n-number", "tail"] },
  { to: "/billing", label: "Billing", icon: Receipt, keywords: ["invoices", "payments", "money", "revenue"] },
  { to: "/compliance", label: "Go / No-Go", icon: ShieldCheck, keywords: ["gng", "go no go", "currency", "medical", "documents"] },
  {
    to: "/training",
    label: "Training",
    icon: GraduationCap,
    keywords: ["courses", "syllabus", "curriculum", "enrollments", "lessons", "part 141", "part 61", "endorsements"],
  },
  { to: "/facilities", label: "Facilities", icon: MonitorPlay, keywords: ["simulators", "classrooms", "rooms", "locations"] },
  { to: "/operations/announcements", label: "Announcements", icon: Megaphone, keywords: ["notices", "posts", "news"] },
  { to: "/operations/cancellations", label: "Cancellations", icon: CalendarX2, keywords: ["cancelled", "cancel", "no show"] },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, keywords: ["history", "who changed", "activity", "trail"] },
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
    { to: "/me", label: "Home", icon: Home, keywords: ["my home", "personal"] },
    { to: "/me/schedule", label: "Schedule", icon: CalendarDays, keywords: ["my flights", "my bookings"] },
    // Only roles that can actually be seated on a booking — a pure dispatcher
    // books from the board, not here.
    ...(canSelfBook(R)
      ? [{ to: "/me/book", label: "Book", icon: CalendarPlus, keywords: ["book a flight", "new booking", "reserve"] }]
      : []),
    { to: "/me/invoices", label: "Invoices", icon: Wallet, keywords: ["my bill", "pay", "balance", "statement"] },
    // Only for people who can actually be on a syllabus. A dispatcher or technician
    // has no training record, and an empty page in their personal nav reads as broken.
    ...(R.includes("student") || R.includes("instructor")
      ? [
          {
            to: "/me/training",
            label: "My training",
            icon: GraduationCap,
            keywords: ["my record", "my course", "progress", "my endorsements", "lessons"],
          },
        ]
      : []),
    { to: "/me/currencies", label: "Currencies", icon: ShieldCheck, keywords: ["my medical", "bfr", "flight review"] },
    { to: "/me/documents", label: "Documents", icon: FileText, keywords: ["my license", "certificate", "upload"] },
  ];
}

/**
 * Destinations that never appear in the rail but that a user can land on and
 * want back quickly — this is most of what makes "Recent" worth having, since
 * the rail itself already holds the org pages.
 */
const OFF_RAIL: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings, keywords: ["preferences", "config", "organization", "school"] },
  {
    to: "/me/training",
    label: "My training",
    icon: GraduationCap,
    keywords: ["my record", "my course", "progress", "my endorsements"],
  },
  { to: "/settings/integrations/quickbooks", label: "QuickBooks", icon: Receipt, keywords: ["qbo", "intuit", "accounting", "sync"] },
  { to: "/notifications", label: "Notifications", icon: Bell, keywords: ["alerts", "inbox", "messages"] },
  { to: "/me/profile", label: "Profile", icon: UserIcon, keywords: ["my account", "name", "password", "contact details"] },
  { to: "/me/notifications", label: "Notification settings", icon: Bell, keywords: ["email preferences", "turn off", "unsubscribe"] },
  { to: "/me/payment-methods", label: "Payment methods", icon: CreditCard, keywords: ["my card", "credit card", "ach", "bank"] },
  { to: "/me/availability", label: "Availability", icon: Clock, keywords: ["my hours", "when i work", "unavailable"] },
  { to: "/developer", label: "Developer", icon: TerminalSquare, keywords: ["internal", "support tools", "log in as"] },
];

/**
 * Where each off-rail page sits, for a breadcrumb. The two on-rail lists get their
 * section from the rail itself ("Operations", "You"); these are the leftovers, and they
 * belong in several different places.
 */
const OFF_RAIL_PATH: Record<string, string[]> = {
  "/settings": ["Settings"],
  "/settings/integrations/quickbooks": ["Settings", "Integrations", "QuickBooks"],
  "/notifications": ["You", "Notifications"],
  "/me/training": ["You", "My training"],
  "/me/profile": ["You", "Profile"],
  "/me/notifications": ["You", "Profile", "Notification settings"],
  "/me/payment-methods": ["You", "Profile", "Payment methods"],
  "/me/availability": ["You", "Profile", "Availability"],
  "/developer": ["Developer"],
};

/** Everything addressable, longest path first so prefix matching prefers the leaf. */
const ALL_PAGES: NavItem[] = [
  ...OPERATIONS,
  ...youNav(["owner", "instructor"]),
  ...OFF_RAIL,
].sort((a, b) => b.to.length - a.to.length);

/**
 * One destination the command palette can offer, with a Stripe-style breadcrumb.
 *
 * `search` is what makes Settings work: its eleven sections share one route and are told
 * apart only by `?tab=`, so a palette entry has to carry the tab or every one of them
 * lands on Organization.
 */
export type CommandPage = {
  to: string;
  label: string;
  icon: NavIcon;
  path: string[];
  keywords: string[];
  search?: Record<string, string>;
};

const asCommandPages = (items: NavItem[], section: string): CommandPage[] =>
  items.map((item) => ({
    to: item.to,
    label: item.label,
    icon: item.icon,
    path: OFF_RAIL_PATH[item.to] ?? [section, item.label],
    keywords: item.keywords ?? [],
  }));

/**
 * Every page this member can actually open — the palette's whole "Go to" list.
 *
 * Derived from the SAME registry the rail renders, deliberately: the palette used to keep
 * its own hand-written list of eight destinations, and by the time Training, Reports,
 * Maintenance, Facilities, Audit Logs, Announcements and the entire personal section had
 * shipped, none of them could be reached by searching for them. A page added above is
 * findable here for free; a list that has to be updated twice only ever gets updated once.
 *
 * Access is the rail's rule too (`canAccess` → ROUTE_ACCESS), so the palette can never
 * offer a link that bounces the user straight back out. `/developer` is the exception the
 * route guard owns rather than ROUTE_ACCESS, so the caller passes that answer in.
 */
export function commandPages(roles: string[], opts: { isDeveloper: boolean }): CommandPage[] {
  const R = roles as Role[];
  const pages = [
    ...asCommandPages(operationsNav(roles), "Operations"),
    ...asCommandPages(youNav(roles), "You"),
    ...asCommandPages(
      OFF_RAIL.filter((item) => item.to !== "/developer" || opts.isDeveloper).filter((item) =>
        canAccess(item.to, R)
      ),
      "More"
    ),
  ];

  // `/me/training` is in both the personal nav and the off-rail list; the first wins.
  const seen = new Set<string>();
  const unique = pages.filter((page) => {
    if (seen.has(page.to)) return false;
    seen.add(page.to);
    return true;
  });

  return canAccess("/settings", R) ? [...unique, ...settingsPages()] : unique;
}

/** Each Settings section as its own destination — see `CommandPage.search`. */
function settingsPages(): CommandPage[] {
  return SETTINGS_SECTIONS.flatMap((section) =>
    section.tabs.map((tab) => ({
      to: "/settings",
      label: tab.label,
      icon: tab.icon,
      path: ["Settings", section.label, tab.label],
      keywords: ["settings", ...(tab.keywords ?? [])],
      search: { tab: tab.value },
    }))
  );
}

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
