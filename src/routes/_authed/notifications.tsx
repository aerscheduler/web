import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  useNotifications,
  useMarkNotificationRead,
  useClearNotifications,
} from "@/features/queries";
import { PageHeader } from "@/components/page-header";
import { TableView } from "@/components/table-view";
import { ListSearch } from "@/components/list-search";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  const [search, setSearch] = useState("");
  const debouncedQ = useDebouncedValue(search);
  const q = useNotifications({ q: debouncedQ || undefined });
  const markRead = useMarkNotificationRead();
  const clear = useClearNotifications();
  const confirm = useConfirm();

  const notifications = q.data ?? [];
  const unreadCount = notifications.filter((n) => n.readAt == null).length;
  const searching = !!debouncedQ;

  function onMarkRead(id: number) {
    markRead.mutate(id, {
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Couldn't mark that as read."),
    });
  }

  async function onMarkAllRead() {
    const ok = await confirm({
      title: "Mark all as read?",
      description: "Every notification will be marked read and cleared from your unread count.",
      confirmLabel: "Mark all read",
    });
    if (!ok) return;
    clear.mutate(undefined, {
      onSuccess: () => toast.success("All caught up."),
      onError: (e) =>
        toast.error(e instanceof Error ? e.message : "Couldn't clear notifications."),
    });
  }

  return (
    <TableView>
      <TableView.Header>
        <PageHeader
          title="Notifications"
          subtitle={
            q.data
              ? unreadCount > 0
                ? `${unreadCount} unread`
                : "You're all caught up"
              : "Your recent activity"
          }
          actions={
            notifications.length > 0 && unreadCount > 0 ? (
              <Button variant="outline" onClick={onMarkAllRead} disabled={clear.isPending}>
                <CheckCheck className="size-4" /> Mark all read
              </Button>
            ) : undefined
          }
        />
        <ListSearch
          value={search}
          onChange={setSearch}
          placeholder="Search notifications…"
          aria-label="Search notifications"
        />
      </TableView.Header>

      {q.isPending ? (
        <TableView.Body>
          <CardGridSkeleton count={4} />
        </TableView.Body>
      ) : q.isError ? (
        <Card className="min-h-0 flex-1 p-0">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : notifications.length === 0 && !searching ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={BellOff}
            title="You're all caught up."
            body="Reservation changes, squawks, and account activity will show up here."
          />
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="min-h-0 flex-1 p-0">
          <EmptyState
            icon={BellOff}
            title="No matches"
            body="Nothing matches that search."
          />
        </Card>
      ) : (
        <TableView.Body>
          <div className="space-y-2.5">
            {notifications.map((n) => (
              <NotificationItem
                key={n.id}
                notification={n}
                onMarkRead={onMarkRead}
                marking={markRead.isPending}
              />
            ))}
          </div>
        </TableView.Body>
      )}
    </TableView>
  );
}
