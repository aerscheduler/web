import { describe, expect, it } from "vitest";
import { searchLinkFor } from "./search-links";
import type { SearchResult } from "@/types/api";

const hit = (over: Partial<SearchResult> & Pick<SearchResult, "type">): SearchResult => ({
  id: 1,
  title: "Solo",
  subtitle: null,
  date: null,
  dateLabel: null,
  timeZone: null,
  badge: null,
  params: {},
  ...over,
});

describe("searchLinkFor endorsements", () => {
  it("opens My training Endorsements for the viewer's own endorsement", () => {
    expect(
      searchLinkFor(hit({ type: "endorsement", params: { orgUserId: 9 } }), 9)
    ).toEqual({ to: "/me/training", search: { tab: "endorsements" } });
  });

  it("opens the person page for someone else's endorsement", () => {
    const link = searchLinkFor(hit({ type: "endorsement", params: { orgUserId: 4 } }), 9);
    expect(link.to).toBe("/people/$orgUserId");
    expect(link.params).toEqual({ orgUserId: "4" });
  });
});

describe("searchLinkFor reservations", () => {
  it("opens the booking's own page", () => {
    const link = searchLinkFor(hit({ type: "reservation", params: { reservationId: 42 } }), 9);
    expect(link).toEqual({
      to: "/schedule/reservations/$reservationId",
      params: { reservationId: "42" },
    });
  });

  it("falls back to the board filtered by title when the hit has no id", () => {
    expect(searchLinkFor(hit({ type: "reservation" }), 9)).toEqual({
      to: "/schedule",
      search: { q: "Solo" },
    });
  });
});
