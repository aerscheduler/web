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
 * People and aircraft have real detail routes, so those hits go straight to the
 * record: `/people/:orgUserId` and `/aircraft/:resourceId`. So does anyone
 * else's currency or document, since that person's page is where the console
 * shows both together.
 *
 * Everything else still has no page of its own, and lands on the list that owns
 * it with that list's `?q=` pre-filled — which leaves the row on screen,
 * filtered, in its normal context.
 *
 * Pure and dependency-light on purpose: the palette should not be where you
 * discover that a link is wrong.
 */

export type SearchLink = {
  to: string;
  /** Path params, for the routes that take one. */
  params?: Record<string, string>;
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
 * self-serve pages under /me, anyone else's to their page. Pass null when the
 * viewer is unknown and everything falls back to the roster, which is reachable
 * by any member.
 */
export function searchLinkFor(result: SearchResult, viewerOrgUserId: number | null): SearchLink {
  const ownerId = asInt(result.params.orgUserId);
  const isMine = ownerId != null && viewerOrgUserId != null && ownerId === viewerOrgUserId;
  // Falls back to the roster when the hit carries no owner id — better a list
  // than a `/people/NaN` that renders "no such member".
  const memberPage: SearchLink =
    ownerId != null
      ? { to: "/people/$orgUserId", params: { orgUserId: String(ownerId) } }
      : { to: "/people" };

  switch (result.type) {
    case "person":
      return memberPage;

    case "resource": {
      // Only aircraft have a detail page. Simulators and classrooms live on
      // Facilities, which has no per-record page, so they land there filtered.
      const resourceId = asInt(result.params.resourceId);
      const kind = result.params.kind;
      if (kind === "simulator" || kind === "room") {
        return { to: "/facilities", search: { q: result.title } };
      }
      return resourceId != null
        ? { to: "/aircraft/$resourceId", params: { resourceId: String(resourceId) } }
        : { to: "/aircraft", search: { q: result.title } };
    }

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
      return isMine ? { to: "/me/currencies" } : memberPage;

    case "document":
      return isMine ? { to: "/me/documents" } : memberPage;

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
