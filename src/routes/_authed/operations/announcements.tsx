import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { parseISO } from "date-fns";
import { useAnnouncements } from "@/features/queries";
import type { Announcement } from "@/types/api";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearchBar } from "@/components/list-filters";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";

export const Route = createFileRoute("/_authed/operations/announcements")({
  validateSearch: (s) => validateListSearch(s, []),
  component: AnnouncementsPage,
});

/**
 * Every notice the school has posted, in full.
 *
 * The member home shows the two most recent as a courtesy; this is the page
 * that actually holds them, and the one the ⌘K palette links an announcement
 * hit to. Read-only by design: posting is admin-only and already lives in the
 * app — the console's job here is finding one you were told about.
 *
 * `q` filters client-side. `GET /announcements` has no `q` param and returns
 * the org's whole list in one call, so a server round-trip per keystroke would
 * buy nothing. (The global search box does hit the server — that one searches
 * across every entity, not just this list.)
 */
function AnnouncementsPage() {
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ } = useListQueryState({
    storageKey: "announcements",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [],
  });

  const q = useAnnouncements();
  const now = Date.now();

  const { live, expired } = React.useMemo(() => {
    const needle = (debouncedQ ?? "").trim().toLowerCase();
    const matches = (a: Announcement) =>
      !needle ||
      a.title.toLowerCase().includes(needle) ||
      (a.message ?? "").toLowerCase().includes(needle);

    const all = (q.data ?? []).filter(matches);
    const isLive = (a: Announcement) => !a.expireAt || parseISO(a.expireAt).getTime() >= now;
    const byNewest = (a: Announcement, b: Announcement) => b.createdAt.localeCompare(a.createdAt);

    return {
      live: all.filter(isLive).sort(byNewest),
      // Kept, but below the fold and labelled: an expired notice is history, and
      // global search drops it entirely.
      expired: all.filter((a) => !isLive(a)).sort(byNewest),
    };
  }, [q.data, debouncedQ, now]);

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Announcements"
          subtitle="Notices posted to the school. Post and edit them from the mobile app."
        />
        <ListSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search announcements…"
          aria-label="Search announcements"
        />
      </TableView.Header>

      {q.isLoading ? (
        <TableView.Body>
          <CardGridSkeleton />
        </TableView.Body>
      ) : q.error ? (
        <Card className="min-h-0 flex-1 p-0">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : live.length === 0 && expired.length === 0 ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={Megaphone}
            title={debouncedQ ? "No matching announcements" : "No announcements yet"}
            body={
              debouncedQ
                ? "Try a different word from the title or the message."
                : "Notices posted from the app show up here for everyone."
            }
          />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-4">
            <div className="space-y-3">
              {live.map((a) => (
                <AnnouncementCard key={a.id} announcement={a} />
              ))}
            </div>

            {expired.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">Expired</h2>
                {expired.map((a) => (
                  <AnnouncementCard key={a.id} announcement={a} expired />
                ))}
              </div>
            )}
          </div>
        </TableView.Body>
      )}
    </TableView>
  );
}

function AnnouncementCard({
  announcement,
  expired = false,
}: {
  announcement: Announcement;
  expired?: boolean;
}) {
  const { title, message, expireAt, createdAt, forRoles } = announcement;

  return (
    <Card className={expired ? "p-4 opacity-60" : "p-4"}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
          <Megaphone className="size-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium">{title}</h3>
            {expired && <Badge variant="outline">Expired</Badge>}
            {/* Targeting is informational here: the server decides who a post
                reaches in search, and everyone can read the board itself. */}
            {(forRoles ?? []).map((role) => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </div>
          {message && (
            <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{message}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Posted {formatDate(createdAt, "MMM d, yyyy")}
            {expireAt && ` · ${expired ? "Expired" : "Expires"} ${formatDate(expireAt, "MMM d, yyyy")}`}
          </p>
        </div>
      </div>
    </Card>
  );
}
