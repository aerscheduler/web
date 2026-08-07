import {
  CalendarDays,
  ClipboardList,
  FileSignature,
  FileText,
  GraduationCap,
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
 * People, aircraft, courses and training records have real detail routes, so those hits go
 * straight to the record: `/people/:orgUserId`, `/aircraft/:resourceId`,
 * `/training/:courseId`, `/training/enrollments/:enrollmentId`. So does anyone else's
 * currency, document or endorsement, since that person's page is where the console shows
 * all three together.
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
  course: "Courses",
  //Not "Enrollments": the console calls this a training record everywhere else, and it is
  //what somebody is actually looking for when they search a student's name.
  enrollment: "Training records",
  endorsement: "Endorsements",
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
  course: GraduationCap,
  enrollment: ClipboardList,
  endorsement: FileSignature,
};

/**
 * Display order — the sequence the palette groups hits in. Deliberately not the
 * server's order: what you're most likely to be hunting for goes first.
 *
 * The training block sits with the other per-person records rather than at the end: a
 * school searching a student's name wants that student's record next to their currencies,
 * not below the location list.
 */
export const SEARCH_TYPE_ORDER: SearchEntityType[] = [
  "person",
  "resource",
  "reservation",
  "squawk",
  "enrollment",
  "currency",
  "endorsement",
  "document",
  "course",
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
      // Facilities, which has no per-record page, so they land there filtered —
      // and on the right section, or a room hit lands among the simulators and
      // gets filtered straight back out of the page it just took you to.
      const resourceId = asInt(result.params.resourceId);
      const kind = result.params.kind;
      if (kind === "simulator" || kind === "room") {
        return {
          to: "/facilities",
          search: { q: result.title, tab: kind === "room" ? "rooms" : "simulators" },
        };
      }
      return resourceId != null
        ? { to: "/aircraft/$resourceId", params: { resourceId: String(resourceId) } }
        : { to: "/aircraft", search: { q: result.title } };
    }

    case "location":
      return { to: "/facilities", search: { q: result.title } };

    case "rating":
      // Ratings are org configuration; Settings → Instruction rates is where they're
      // edited. Settings is eleven screens behind one URL, so the tab is the whole link:
      // without it the hit lands on Organization and the rating is nowhere on screen.
      return { to: "/settings", search: { tab: "rates" } };

    case "reservation":
      return { to: "/schedule", search: { q: result.title } };

    case "announcement":
      return { to: "/operations/announcements", search: { q: result.title } };

    case "currency":
      return isMine ? { to: "/me/currencies" } : memberPage;

    case "document":
      return isMine ? { to: "/me/documents" } : memberPage;

    case "squawk": {
      // Now a record of its own, so a hit opens the write-up instead of filtering a board
      // down to it. The old behaviour is still the fallback, and it has to stay correct:
      // Maintenance has no "all" view, it shows open OR resolved, so a hit with no id
      // lands on the one this squawk is actually in or it gets filtered straight back out
      // of the page it just took you to.
      const squawkId = asInt(result.params.squawkId);
      return squawkId != null
        ? { to: "/maintenance/squawks/$squawkId", params: { squawkId: String(squawkId) } }
        : {
            to: "/maintenance",
            search: {
              q: result.title,
              view: result.badge === "Open" ? "open" : "resolved",
            },
          };
    }

    case "course": {
      const courseId = asInt(result.params.courseId);
      return courseId != null
        ? { to: "/training/$courseId", params: { courseId: String(courseId) } }
        : { to: "/training" };
    }

    case "enrollment": {
      // The record has a page of its own, and it is the same page whether it's yours or
      // a student's — /me/training is a list, this is the record. Anyone who could
      // search up an enrollment can open it (`canReadEnrollment` scopes both).
      const enrollmentId = asInt(result.params.enrollmentId);
      return enrollmentId != null
        ? { to: "/training/enrollments/$enrollmentId", params: { enrollmentId: String(enrollmentId) } }
        : { to: "/training" };
    }

    case "endorsement":
      // No page of its own — it's a card on a person, exactly like a currency or a
      // document, so it follows the same self-vs-someone-else rule those two do.
      return isMine ? { to: "/me/training" } : memberPage;
  }
}
