import {
  CalendarDays,
  FileText,
  Megaphone,
  MapPin,
  PlaneTakeoff,
  ShieldCheck,
  Users,
  Wrench,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { SearchEntityType, SearchResult } from "@/types/api";

/**
 * Where a search hit goes when you pick it, and how it's labelled.
 *
 * The console has no per-entity detail ROUTES — lists own their rows and open
 * sheets from local state. So rather than invent nine new pages, a hit lands on
 * the page that already owns it with that page's own `?q=` pre-filled, which
 * leaves the row on screen, filtered, in its normal context. Two exceptions
 * carry an id instead: a person, and another member's currency or document,
 * open that member's profile sheet via `/people?member=<id>` — the only place
 * the console shows one member's currencies and documents together.
 *
 * Pure and dependency-light on purpose: the palette should not be where you
 * discover that a link is wrong.
 */

export type SearchLink = {
  to: string;
  search?: Record<string, string>;
};

export const SEARCH_TYPE_LABEL: Record<SearchEntityType, string> = {
  person: "People",
  resource: "Aircraft",
  location: "Locations",
  rating: "Ratings",
  reservation: "Reservations",
  announcement: "Announcements",
  currency: "Currencies",
  document: "Documents",
  squawk: "Squawks",
};

export const SEARCH_TYPE_ICON: Record<SearchEntityType, LucideIcon> = {
  person: Users,
  resource: PlaneTakeoff,
  location: MapPin,
  rating: BookOpen,
  reservation: CalendarDays,
  announcement: Megaphone,
  currency: ShieldCheck,
  document: FileText,
  squawk: Wrench,
};

/**
 * Display order — the sequence the palette groups hits in. Deliberately not the
 * server's order: what you're most likely to be hunting for goes first.
 */
export const SEARCH_TYPE_ORDER: SearchEntityType[] = [
  "person",
  "resource",
  "reservation",
  "squawk",
  "currency",
  "document",
  "announcement",
  "location",
  "rating",
];

const asInt = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : null;
};

/**
 * Resolve a hit to a route.
 *
 * `viewerOrgUserId` decides whose currency/document this is: your own go to the
 * self-serve pages under /me, anyone else's to their profile sheet. Pass null
 * when the viewer is unknown and everything falls back to the roster, which is
 * reachable by any member.
 */
export function searchLinkFor(result: SearchResult, viewerOrgUserId: number | null): SearchLink {
  const ownerId = asInt(result.params.orgUserId);
  const isMine = ownerId != null && viewerOrgUserId != null && ownerId === viewerOrgUserId;
  const memberSheet: SearchLink =
    ownerId != null ? { to: "/people", search: { member: String(ownerId) } } : { to: "/people" };

  switch (result.type) {
    case "person":
      return memberSheet;

    case "resource":
      return { to: "/aircraft", search: { q: result.title } };

    case "location":
      return { to: "/facilities", search: { q: result.title } };

    case "rating":
      // Ratings are org configuration; Settings → Rates is where they're edited.
      return { to: "/settings" };

    case "reservation":
      return { to: "/schedule", search: { q: result.title } };

    case "announcement":
      return { to: "/operations/announcements", search: { q: result.title } };

    case "currency":
      return isMine ? { to: "/me/currencies" } : memberSheet;

    case "document":
      return isMine ? { to: "/me/documents" } : memberSheet;

    case "squawk":
      // Maintenance has no "all" view — it shows open OR resolved. Land on the
      // one this squawk is actually in, or a resolved hit gets filtered straight
      // back out of the page it just took you to.
      return {
        to: "/maintenance",
        search: {
          q: result.title,
          view: result.badge === "Open" ? "open" : "resolved",
        },
      };
  }
}
