import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { parseISO } from "date-fns";
import { pageRows, useAnnouncementsPage } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
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
 * Paged, searched and split live/expired by the server. All three used to
 * happen here over one fetched array, which was fine only while the whole list
 * arrived at once.
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

  // Live and expired used to be two client-split sections of one fetched array.
  // That stopped working the moment the list paged — page one could be entirely
  // live, and the "Expired" heading would vanish while expired notices existed.
  // Now it is one paged list, newest first, with expired rows dimmed and badged.
  //
  // There is deliberately no Expired FILTER, even though the API takes one:
  // `AnnouncementService.deleteExpired()` hard-deletes expired notices on a
  // schedule, so such a filter would almost always answer "none" and would be
  // advertising a view of rows the server has already reaped.
  const filter = { q: debouncedQ };
  const paging = usePaging({ resetKey: filter });
  const q = useAnnouncementsPage(filter, paging);
  const { rows: announcements, total } = pageRows(q);
  const now = Date.now();
  const isLive = (a: Announcement) => !a.expireAt || parseISO(a.expireAt).getTime() >= now;

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
      ) : total === 0 ? (
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
        <>
          <TableView.Body>
            <div className={cn("space-y-3", q.isFetching && "opacity-60")}>
              {announcements.map((a) => (
                <AnnouncementCard key={a.id} announcement={a} expired={!isLive(a)} />
              ))}
            </div>
          </TableView.Body>
          <TablePagination
            paging={paging}
            total={total}
            returned={announcements.length}
            loading={q.isFetching}
          />
        </>
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
