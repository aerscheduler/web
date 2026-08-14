import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Megaphone, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { parseISO } from "date-fns";
import { toast } from "sonner";
import {
  pageRows,
  useAnnouncementsPage,
  useDeleteAnnouncement,
  useMarkAnnouncementSeen,
} from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/types/api";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { DocsHint } from "@/components/docs-hint";
import { TableView } from "@/components/table-view";
import { ListSearchBar } from "@/components/list-filters";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useListQueryState, validateListSearch } from "@/lib/list-query-state";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { AnnouncementFormDialog } from "@/components/operations/announcement-form-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authed/operations/announcements")({
  validateSearch: (s) => validateListSearch(s, []),
  component: AnnouncementsPage,
});

/**
 * Every notice the school has posted, in full.
 *
 * Admins post, edit and delete here. The member home shows the two most recent as a
 * courtesy; this is the page that holds them, and the one the ⌘K palette links an
 * announcement hit to.
 *
 * Paged, searched and split live/expired by the server. All three used to happen here
 * over one fetched array, which was fine only while the whole list arrived at once.
 */
function AnnouncementsPage() {
  const { roles } = useAuth();
  const admin = isAdmin(roles);
  const routeSearch = Route.useSearch();
  const navigate = Route.useNavigate();
  const { search, setSearch, debouncedQ } = useListQueryState({
    storageKey: "announcements",
    search: routeSearch,
    navigate: navigate as Parameters<typeof useListQueryState>[0]["navigate"],
    facetKeys: [],
  });

  const filter = { q: debouncedQ };
  const paging = usePaging({ resetKey: filter });
  const q = useAnnouncementsPage(filter, paging);
  const { rows: announcements, total } = pageRows(q);
  const now = Date.now();
  const isLive = (a: Announcement) => !a.expireAt || parseISO(a.expireAt).getTime() >= now;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Announcement | null>(null);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(a: Announcement) {
    setEditing(a);
    setFormOpen(true);
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Announcements"
          subtitle={
            <span className="inline-flex items-center gap-1.5">
              Notices posted to the school.
              <DocsHint topic="hide-announcement" />
            </span>
          }
          actions={
            admin ? (
              <Button onClick={openCreate} data-doc-shot="announcements-new-button">
                <Plus className="size-4" /> New announcement
              </Button>
            ) : undefined
          }
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
                : admin
                  ? "Post the first notice so members see it on home and get notified."
                  : "When an admin posts a notice, it shows up here for everyone."
            }
            action={
              admin && !debouncedQ ? (
                <Button onClick={openCreate}>
                  <Plus className="size-4" /> New announcement
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <TableView.Body>
            <div className={cn("space-y-3", q.isFetching && "opacity-60")}>
              {announcements.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  expired={!isLive(a)}
                  canManage={admin}
                  onEdit={() => openEdit(a)}
                />
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

      {admin && (
        <AnnouncementFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          announcement={editing}
        />
      )}
    </TableView>
  );
}

function AnnouncementCard({
  announcement,
  expired = false,
  canManage,
  onEdit,
}: {
  announcement: Announcement;
  expired?: boolean;
  canManage: boolean;
  onEdit: () => void;
}) {
  const { title, message, expireAt, createdAt, forRoles, seenAt } = announcement;
  const remove = useDeleteAnnouncement();
  const markSeen = useMarkAnnouncementSeen();
  const confirm = useConfirm();

  async function onDelete() {
    const ok = await confirm({
      title: `Delete "${title}"?`,
      description: "The notice leaves the board for everyone. This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(announcement.id);
      toast.success("Announcement deleted");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't delete the announcement");
    }
  }

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
            {seenAt && !expired && <Badge variant="secondary">Seen</Badge>}
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
        <div className="flex shrink-0 items-center gap-1">
          {!seenAt && !expired && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid={`announcement-got-it-${announcement.id}`}
              disabled={markSeen.isPending}
              onClick={() => void markSeen.mutateAsync(announcement.id)}
            >
              <Check className="size-4" />
              Got it
            </Button>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Announcement actions"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => void onDelete()}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </Card>
  );
}
